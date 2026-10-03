// Writes formatBhd() outputs from @sahel/domain so the Flutter tests can assert identical formatting.
import { writeFileSync } from 'node:fs';
import { formatBhd } from '../packages/domain/src/money.ts';
const cases = [0, 5, 232838, 1234500, 14900000, 310000000].flatMap((fils) =>
  (['en', 'ar'] as const).flatMap((locale) => ([0, 3] as const).map((decimals) => ({ fils, locale, decimals, text: formatBhd(fils, locale, { decimals }) }))),
);
writeFileSync(new URL('../apps/mobile/test/fixtures/money.json', import.meta.url), JSON.stringify(cases, null, 2) + '\n');
console.log(cases.slice(0, 8));
