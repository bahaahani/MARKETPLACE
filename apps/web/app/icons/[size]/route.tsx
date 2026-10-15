import { ImageResponse } from 'next/og';
import { BRAND_COLOR } from '@/lib/seo';

// Built once at `next build`: the brand "S" mark (Header.tsx) as PNG icons for the manifest and Apple touch icon.
export const dynamic = 'force-static';

// `maskable-512` fills the whole square (the OS crops it); the others are a rounded square.
const SIZES = { '180': 180, '192': 192, '512': 512, 'maskable-512': 512 } as const;
type SizeKey = keyof typeof SIZES;

export function generateStaticParams() {
  return (Object.keys(SIZES) as SizeKey[]).map((size) => ({ size }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const key = (await params).size as SizeKey;
  if (!(key in SIZES)) return new Response('Not found', { status: 404 });
  const px = SIZES[key];
  const maskable = key.startsWith('maskable');
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: BRAND_COLOR,
          color: '#fff',
          fontSize: px * (maskable ? 0.5 : 0.62),
          fontWeight: 700,
          borderRadius: maskable ? 0 : px * 0.22,
        }}
      >
        S
      </div>
    ),
    { width: px, height: px },
  );
}
