'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { ClaimRules, ClaimSeverity, ClaimType, ClaimView, Localized } from '@sahel/domain';
import { t, type AppLocale, type MessageKey } from '@sahel/i18n';
import { CLAIM_SEVERITY_LABEL, CLAIM_TYPE_LABEL, claimErrorKey } from '@/lib/claims-labels';

/** What the form needs to know about each active motor policy (picked on the server). */
export interface ClaimablePolicy {
  id: string;
  policyNumber: string;
  insurerName: Localized;
  plate: string;
}

interface Photo {
  dataUrl: string;
  bytes: number;
}

/** Local date-time for <input type="datetime-local"> (minute precision). */
function localInputValue(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/**
 * Makes a photo small enough to upload: scaled so the longer side is at most `maxDimension`, re-encoded as JPEG
 * (which also drops EXIF metadata such as GPS), lowering quality until it fits `maxBytes`.
 * The API still checks size and type (by magic bytes).
 */
async function compressPhoto(file: File, maxDimension: number, maxBytes: number): Promise<Photo> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const quality of [0.8, 0.65, 0.5, 0.35]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (blob && blob.size <= maxBytes) return { dataUrl: await blobToDataUrl(blob), bytes: blob.size };
  }
  throw new Error('photo too large');
}

/** First Notice of Loss form (J6). Posts to the same API the Flutter app uses; the server validates everything. */
export function ClaimForm({ locale, policies, initialPolicyId, rules }: { locale: AppLocale; policies: ClaimablePolicy[]; initialPolicyId?: string; rules: ClaimRules }) {
  const tr = (k: MessageKey, v?: Record<string, string | number>) => t(locale, k, v);
  const router = useRouter();
  const [policyId, setPolicyId] = useState(initialPolicyId ?? policies[0]?.id ?? '');
  const [incidentAt, setIncidentAt] = useState('');
  const [maxIncidentAt, setMaxIncidentAt] = useState<string>();
  const [location, setLocation] = useState('');
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locating, setLocating] = useState<'idle' | 'busy' | 'failed'>('idle');
  const [type, setType] = useState<ClaimType>('collision');
  const [severity, setSeverity] = useState<ClaimSeverity>('moderate');
  const [description, setDescription] = useState('');
  const [policeReportNumber, setPoliceReportNumber] = useState('');
  const [thirdPartyInvolved, setThirdPartyInvolved] = useState(false);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  // One key per form: a double submit or a retry after a network error files the claim only once.
  const idempotencyKey = useMemo(() => `claim-${crypto.randomUUID()}`, []);
  const fileInput = useRef<HTMLInputElement>(null);

  // Browser time is only known on the client (no hydration mismatch).
  useEffect(() => {
    const now = localInputValue(new Date());
    setIncidentAt(now);
    setMaxIncidentAt(now);
  }, []);

  const policeRequired = rules.policeReportRequiredFor.includes(type);
  const pill = (active: boolean) => `rounded-full border px-3 py-1 ${active ? 'border-brand bg-brand text-white' : 'border-border'}`;
  const field = 'w-full rounded-lg border border-border bg-surface p-2';

  async function addPhotos(files: FileList | null) {
    if (!files) return;
    setError(null);
    const room = rules.maxPhotos - photos.length;
    const picked = [...files].slice(0, room);
    try {
      const done = await Promise.all(picked.map((f) => compressPhoto(f, rules.photoMaxDimensionPx, rules.maxPhotoBytes)));
      setPhotos((p) => [...p, ...done].slice(0, rules.maxPhotos));
      if (files.length > room) setError('claimErrorTooManyPhotos');
    } catch {
      setError('claimErrorPhoto');
    }
    if (fileInput.current) fileInput.current.value = '';
  }

  function locateMe() {
    if (!navigator.geolocation) return setLocating('failed');
    setLocating('busy');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        setLocating('idle');
      },
      () => setLocating('failed'),
      { timeout: 10_000, maximumAge: 60_000 },
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const at = new Date(incidentAt);
    if (Number.isNaN(at.getTime())) return setError('claimErrorTime');
    setBusy(true);
    try {
      const res = await fetch('/api/v1/claims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({
          policyId,
          incidentAt: at.toISOString(),
          location,
          ...(coords ?? {}),
          type,
          severity,
          description,
          ...(policeReportNumber.trim() ? { policeReportNumber: policeReportNumber.trim() } : {}),
          thirdPartyInvolved,
          photos: photos.map((p) => ({ dataBase64: p.dataUrl })),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { data?: ClaimView; error?: { code?: string } };
      if (!res.ok || !json.data) {
        setError(claimErrorKey(json.error?.code));
        setBusy(false);
        return;
      }
      router.push(`/${locale}/claims/${json.data.id}`);
    } catch {
      setError('errorGeneric');
      setBusy(false);
    }
  }

  return (
    <form className="card space-y-5 p-5" onSubmit={submit} data-testid="claim-form" noValidate>
      <label className="block text-sm">
        <span className="mb-1 block font-semibold">{tr('claimPolicy')}</span>
        <select className={field} value={policyId} onChange={(e) => setPolicyId(e.target.value)} data-testid="claim-policy">
          {policies.map((p) => (
            <option key={p.id} value={p.id}>
              {tr('claimPolicyOption', { insurer: p.insurerName[locale], plate: p.plate, number: p.policyNumber })}
            </option>
          ))}
        </select>
      </label>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold">{tr('claimType')}</legend>
        <div className="flex flex-wrap gap-2 text-sm">
          {rules.types.map((ty) => (
            <button key={ty} type="button" aria-pressed={type === ty} className={pill(type === ty)} onClick={() => setType(ty)} data-testid={`claim-type-${ty}`}>
              {tr(CLAIM_TYPE_LABEL[ty])}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold">{tr('claimSeverity')}</legend>
        <div className="flex flex-wrap gap-2 text-sm">
          {rules.severities.map((s) => (
            <button key={s} type="button" aria-pressed={severity === s} className={pill(severity === s)} onClick={() => setSeverity(s)} data-testid={`claim-severity-${s}`}>
              {tr(CLAIM_SEVERITY_LABEL[s])}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-semibold">{tr('claimIncidentAt')}</span>
          <input type="datetime-local" className={field} value={incidentAt} max={maxIncidentAt} onChange={(e) => setIncidentAt(e.target.value)} required data-testid="claim-incident-at" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-semibold">{policeRequired ? tr('claimPoliceReportRequired') : tr('claimPoliceReportOptional')}</span>
          <input
            className={field}
            value={policeReportNumber}
            maxLength={rules.policeReportMaxLength}
            onChange={(e) => setPoliceReportNumber(e.target.value)}
            required={policeRequired}
            dir="ltr"
            data-testid="claim-police-report"
          />
        </label>
      </div>

      <div className="text-sm">
        <label className="block">
          <span className="mb-1 block font-semibold">{tr('claimLocation')}</span>
          <input
            className={field}
            value={location}
            placeholder={tr('claimLocationPlaceholder')}
            minLength={rules.locationMinLength}
            maxLength={rules.locationMaxLength}
            onChange={(e) => setLocation(e.target.value)}
            required
            data-testid="claim-location"
          />
        </label>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button type="button" className="btn btn-ghost px-3 py-1 text-xs" onClick={locateMe} disabled={locating === 'busy'} data-testid="claim-use-location">
            📍 {tr('claimUseMyLocation')}
          </button>
          {coords && (
            <span className="text-xs text-text-muted" dir="ltr" data-testid="claim-coords">
              {tr('claimLocationAdded', { lat: coords.latitude.toFixed(5), lng: coords.longitude.toFixed(5) })}
            </span>
          )}
          {locating === 'failed' && <span className="text-xs text-text-muted">{tr('claimLocationUnavailable')}</span>}
        </div>
      </div>

      <label className="block text-sm">
        <span className="mb-1 block font-semibold">{tr('claimDescription')}</span>
        <textarea
          className={`${field} min-h-24`}
          value={description}
          minLength={rules.descriptionMinLength}
          maxLength={rules.descriptionMaxLength}
          onChange={(e) => setDescription(e.target.value)}
          required
          data-testid="claim-description"
        />
        <span className="text-xs text-text-muted">{tr('claimDescriptionHint', { min: rules.descriptionMinLength, max: rules.descriptionMaxLength })}</span>
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={thirdPartyInvolved} onChange={(e) => setThirdPartyInvolved(e.target.checked)} data-testid="claim-third-party" />
        {tr('claimThirdParty')}
      </label>

      <fieldset className="text-sm">
        <legend className="mb-1 font-semibold">{tr('claimPhotos')}</legend>
        <p className="text-xs text-text-muted">{tr('claimPhotosHint', { max: rules.maxPhotos })}</p>
        <div className="mt-2 flex flex-wrap gap-2" data-testid="claim-photos">
          {photos.map((p, i) => (
            <div key={i} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- local preview of a data URL */}
              <img src={p.dataUrl} alt={tr('claimPhotoAlt', { number: i + 1 })} className="h-20 w-20 rounded-lg border border-border object-cover" data-testid="claim-photo" />
              <button
                type="button"
                className="absolute -end-2 -top-2 grid h-6 w-6 place-items-center rounded-full bg-text text-xs text-white"
                aria-label={tr('claimPhotoRemove', { number: i + 1 })}
                onClick={() => setPhotos((ps) => ps.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <label className={`btn btn-ghost cursor-pointer px-3 py-1 text-xs ${photos.length >= rules.maxPhotos ? 'pointer-events-none opacity-50' : ''}`}>
            📷 {tr('claimPhotosAdd')}
            <input
              ref={fileInput}
              type="file"
              accept={rules.photoMimeTypes.join(',')}
              multiple
              className="sr-only"
              disabled={photos.length >= rules.maxPhotos}
              onChange={(e) => addPhotos(e.target.files)}
              data-testid="claim-photo-input"
            />
          </label>
          <span className="text-xs text-text-muted" data-testid="claim-photo-count">{tr('claimPhotosCount', { count: photos.length, max: rules.maxPhotos })}</span>
        </div>
        <p className="mt-2 text-xs text-text-muted">⚠️ {tr('claimPhotosSandboxNote')}</p>
      </fieldset>

      {error && (
        <p className="text-sm text-danger" role="alert" data-testid="claim-error">
          {tr(error)}
        </p>
      )}
      <button type="submit" className="btn btn-primary w-full sm:w-auto" disabled={busy || !policyId} data-testid="claim-submit">
        {busy ? tr('claimSubmitting') : tr('claimSubmit')}
      </button>
    </form>
  );
}
