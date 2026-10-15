// Renders the launcher-icon and splash PNGs in assets/brand/ from the brand mark (the "S" on the brand colour from
// packages/design-tokens/tokens.json, same look as apps/web/public/icon.svg), using `sharp` from the repo's
// node_modules. Run from the repo root:  node apps/mobile/tool/render_brand_assets.mjs
// Then (needs the Flutter SDK): see "App icons and splash" in apps/mobile/README.md.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const out = join(root, 'apps/mobile/assets/brand');
mkdirSync(out, { recursive: true });
const tokens = JSON.parse(readFileSync(join(root, 'packages/design-tokens/tokens.json'), 'utf8')).color;

// The mark: a geometric S drawn as one stroked path (no font needed), centred in a 1024 box.
const S =
  'M690 340C690 270 600 240 512 240C410 240 340 290 340 360C340 440 420 470 512 500C604 530 690 560 690 650C690 725 615 784 512 784C410 784 330 740 330 670';
const mark = (stroke, scale = 1) =>
  `<g transform="translate(512 512) scale(${scale}) translate(-512 -512)"><path d="${S}" fill="none" stroke="${stroke}" stroke-width="96" stroke-linecap="round" stroke-linejoin="round"/></g>`;
const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">${body}</svg>`;
const bg = (c) => `<rect width="1024" height="1024" fill="${c}"/>`;

const files = {
  // Full-bleed squares (the stores and OS round the corners). Dev and staging differ in colour so builds are told apart.
  'icon.png': svg(bg(tokens.brand) + mark('#fff')),
  'icon_dev.png': svg(bg('#6D28D9') + mark('#fff')),
  'icon_staging.png': svg(bg('#B45309') + mark('#fff')),
  // Android adaptive icon: transparent mark inside the 66% safe zone, on a background colour layer.
  'icon_foreground.png': svg(mark('#fff', 0.66)),
  // Splash mark (white on the brand colour set in flutter_native_splash.yaml).
  'splash_mark.png': svg(mark('#fff', 0.8)),
};
for (const [name, body] of Object.entries(files)) {
  writeFileSync(join(out, name.replace('.png', '.svg')), body + '\n');
  await sharp(Buffer.from(body)).resize(1024, 1024).png().toFile(join(out, name));
  console.log('wrote', `apps/mobile/assets/brand/${name}`);
}
