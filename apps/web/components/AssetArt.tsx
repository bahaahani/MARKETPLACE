/** Placeholder artwork until real listing photos are wired in. */
export function AssetArt({ kind, hue, label }: { kind: 'car' | 'home'; hue: number; label: string }) {
  const bg = `linear-gradient(135deg, hsl(${hue} 55% 92%), hsl(${hue} 45% 80%))`;
  return (
    <div role="img" aria-label={label} className="relative flex aspect-[16/10] items-center justify-center overflow-hidden rounded-t-[inherit]" style={{ background: bg }}>
      <svg viewBox="0 0 64 40" className="w-1/2" style={{ color: `hsl(${hue} 45% 32%)` }} aria-hidden>
        {kind === 'car' ? (
          <path fill="currentColor" d="M10 26l4-9c1-2 3-3 5-3h24c2 0 4 1 5 3l5 9h2c2 0 3 1 3 3v4h-5a5 5 0 01-10 0H21a5 5 0 01-10 0H6v-4c0-2 2-3 4-3zm8-1h12v-8h-9c-1 0-2 0-2 1zm15 0h14l-3-7c0-1-1-1-2-1h-9zM16 36a2.5 2.5 0 100-5 2.5 2.5 0 000 5zm32 0a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
        ) : (
          <path fill="currentColor" d="M32 4l24 18h-6v16H38V26H26v12H14V22H8zm-4 12h8v6h-8z" />
        )}
      </svg>
    </div>
  );
}
