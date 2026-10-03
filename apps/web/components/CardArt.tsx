/**
 * IMTIAZ card visual. With `panMasked`/`expiry` it shows an issued (virtual) card; the number is
 * always masked (last 4 digits only), never a full PAN.
 */
export function CardArt({
  gradient,
  tier,
  panMasked,
  expiry,
  validThruLabel,
}: {
  gradient: [string, string];
  tier: string;
  panMasked?: string;
  expiry?: string;
  validThruLabel?: string;
}) {
  return (
    <div
      className="flex aspect-[1.586] flex-col justify-between p-5 text-white"
      style={{ background: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]})` }}
    >
      <span className="text-sm font-semibold tracking-wide">IMTIAZ</span>
      {panMasked && (
        // Card numbers read left to right in every language.
        <p className="font-mono text-lg tracking-widest sm:text-xl" dir="ltr" data-testid="masked-pan">
          {panMasked}
        </p>
      )}
      <div className="flex items-end justify-between">
        <span className="text-xs opacity-80">
          {tier.toUpperCase()}
          {expiry && (
            <span className="ms-3" data-testid="card-expiry">
              {validThruLabel} <span dir="ltr">{expiry}</span>
            </span>
          )}
        </span>
        <span aria-label="Mastercard" className="flex">
          <span className="h-6 w-6 rounded-full bg-[#eb001b]" />
          <span className="-ms-2 h-6 w-6 rounded-full bg-[#f79e1b] opacity-90" />
        </span>
      </div>
    </div>
  );
}
