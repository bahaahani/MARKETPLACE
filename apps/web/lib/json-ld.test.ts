import { describe, expect, it } from 'vitest';
import { jsonLdString } from './json-ld';

describe('jsonLdString', () => {
  it('cannot close the script element or open a comment', () => {
    const out = jsonLdString({ name: '</script><script>alert(1)</script>', note: '<!-- x -->' });
    expect(out).not.toContain('<');
    expect(out).not.toContain('>');
    expect(out).toContain('\\u003c/script\\u003e');
  });

  it('escapes & and the JavaScript line separators', () => {
    const out = jsonLdString({ a: 'A&B', b: `x${String.fromCharCode(0x2028)}y${String.fromCharCode(0x2029)}z` });
    expect(out).not.toContain('&');
    expect(out).not.toContain(String.fromCharCode(0x2028));
    expect(out).not.toContain(String.fromCharCode(0x2029));
  });

  it('still parses to exactly the same value', () => {
    const data = { '@type': 'Car', name: 'Toyota <Camry> & "Co"', nested: [{ n: 1 }, { s: '</script>' }], ar: 'سيارة' };
    expect(JSON.parse(jsonLdString(data))).toEqual(data);
  });

  it('leaves plain data unchanged', () => {
    expect(jsonLdString({ price: '12.500' })).toBe('{"price":"12.500"}');
  });
});
