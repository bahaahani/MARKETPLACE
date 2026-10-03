import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// api/openapi.yaml is the contract both apps build against; the route handlers in apps/web/app/api/v1 serve it.
const root = join(__dirname, '..', '..', '..');
const spec = readFileSync(join(root, 'api', 'openapi.yaml'), 'utf8');
const apiDir = join(root, 'apps', 'web', 'app', 'api', 'v1');

function routeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? routeFiles(join(dir, e.name)) : e.name === 'route.ts' ? [join(dir, e.name)] : [],
  );
}

/** The YAML block for one path ("  /x:" up to the next path or components). */
function pathBlock(path: string): string | undefined {
  const lines = spec.split('\n');
  const start = lines.indexOf(`  ${path}:`);
  if (start < 0) return undefined;
  const end = lines.findIndex((l, i) => i > start && /^ {2}\/|^\S/.test(l));
  return lines.slice(start, end < 0 ? undefined : end).join('\n');
}

describe('API contract (api/openapi.yaml)', () => {
  it('has no keys a flow mapping silently created from an unquoted comma (they parse as null)', () => {
    // e.g. `{description: A, B}` parses as {description: 'A', 'B': null} and loses half the text.
    expect(spec.split('\n').filter((l) => /:\s*null\b/.test(l))).toEqual([]);
  });

  it('documents every route handler and HTTP method', () => {
    const files = routeFiles(apiDir);
    expect(files.length).toBeGreaterThan(20);
    for (const file of files) {
      const path = file
        .slice(apiDir.length, -'/route.ts'.length)
        .replace(/\\/g, '/')
        .replace(/\[(\w+)\]/g, '{$1}');
      const block = pathBlock(path);
      expect(block, `${path} is missing from api/openapi.yaml`).toBeDefined();
      const methods = [...readFileSync(file, 'utf8').matchAll(/export (?:async )?function (GET|POST|PATCH|PUT|DELETE)\b/g)].map((m) => m[1]!);
      for (const m of methods) expect(block, `${m} ${path}`).toMatch(new RegExp(`^ {4}${m.toLowerCase()}:`, 'm'));
    }
  });
});
