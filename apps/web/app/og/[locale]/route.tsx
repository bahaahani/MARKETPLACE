import { ImageResponse } from 'next/og';
import { LOCALES } from '@sahel/i18n';
import { BRAND_COLOR, COLORS, OG_IMAGE_SIZE } from '@/lib/seo';

// Share image (Open Graph and Twitter) for every page, per locale, built once at `next build`. Only the brand mark
// and name: the default ImageResponse font has no Arabic glyphs, and page-specific text lives in the tags.
export const dynamic = 'force-static';

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!(LOCALES as string[]).includes(locale)) return new Response('Not found', { status: 404 });
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 24,
          background: `linear-gradient(135deg, ${COLORS.brandDark}, ${BRAND_COLOR})`,
          color: '#fff',
        }}
      >
        <div
          style={{
            width: 160,
            height: 160,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 36,
            background: '#fff',
            color: BRAND_COLOR,
            fontSize: 110,
            fontWeight: 700,
          }}
        >
          S
        </div>
        <div style={{ fontSize: 84, fontWeight: 700 }}>Sahel</div>
        <div style={{ fontSize: 34, opacity: 0.85 }}>BCFC</div>
      </div>
    ),
    OG_IMAGE_SIZE,
  );
}
