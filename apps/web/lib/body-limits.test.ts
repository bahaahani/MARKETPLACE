import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CLAIM_MAX_BODY_BYTES } from '@sahel/domain';
import { beforeAll, describe, expect, it } from 'vitest';

// Every API route that reads (or could be sent) a JSON body must cap it. The route list comes from the filesystem, so a
// new route cannot be forgotten: it is called with a huge body and must answer 413, and it must be documented as such.
const webDir = join(__dirname, '..');
const apiDir = join(webDir, 'app', 'api', 'v1');
const spec = readFileSync(join(webDir, '..', '..', 'api', 'openapi.yaml'), 'utf8');

const METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'] as const;

function routeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? routeFiles(join(dir, e.name)) : e.name === 'route.ts' ? [join(dir, e.name)] : [],
  );
}

const routes = routeFiles(apiDir)
  .sort()
  .flatMap((file) => {
    const source = readFileSync(file, 'utf8');
    const path = file.slice(apiDir.length, -'/route.ts'.length).replace(/\\/g, '/').replace(/\[(\w+)\]/g, '{$1}');
    const methods = METHODS.filter((m) => new RegExp(`export (?:async )?function ${m}\\b`).test(source));
    return methods.map((method) => ({ file, source, path, method }));
  });

/** The YAML block of one operation ("    post:" up to the next operation or path). */
function operationBlock(path: string, method: string): string {
  const lines = spec.split('\n');
  const start = lines.indexOf(`  ${path}:`);
  expect(start, `${path} is missing from api/openapi.yaml`).toBeGreaterThanOrEqual(0);
  const pathEnd = lines.findIndex((l, i) => i > start && /^ {2}\/|^\S/.test(l));
  const block = lines.slice(start, pathEnd < 0 ? undefined : pathEnd);
  const op = block.findIndex((l) => l === `    ${method.toLowerCase()}:`);
  expect(op, `${method} ${path} is missing from api/openapi.yaml`).toBeGreaterThanOrEqual(0);
  const opEnd = block.findIndex((l, i) => i > op && /^ {4}\S/.test(l));
  return block.slice(op, opEnd < 0 ? undefined : opEnd).join('\n');
}

describe('request body caps (every mutating API route)', () => {
  it('finds the routes', () => {
    expect(routes.length).toBeGreaterThan(30);
  });

  it('every route that reads a body passes maxBytes to jsonBody (or reads it through claimBody)', () => {
    for (const r of routes.filter((x) => x.source.includes('jsonBody'))) {
      const calls = [...r.source.matchAll(/jsonBody(?:<[^()]*>)?\(/g)];
      for (const c of calls) {
        // the call's arguments: up to the closing parenthesis of this call
        const rest = r.source.slice(c.index!);
        const args = rest.slice(0, rest.indexOf(');') >= 0 ? rest.indexOf(');') : 400);
        expect(args, `${r.method} ${r.path}: jsonBody without maxBytes`).toContain('maxBytes');
      }
    }
  });

  it('every mutating route guards its body (jsonBody, claimBody or noBody)', () => {
    for (const r of routes) {
      expect(/jsonBody|claimBody|noBody/.test(r.source), `${r.method} ${r.path} does not guard the request body`).toBe(true);
    }
  });

  it('every mutating route documents 413 PAYLOAD_TOO_LARGE in api/openapi.yaml', () => {
    for (const r of routes) expect(operationBlock(r.path, r.method), `${r.method} ${r.path}`).toMatch(/'413'/);
  });

  describe('an oversized body is refused with 413', () => {
    let sessionId: string;
    beforeAll(async () => {
      // one session for every call, and limits far above this test's request count
      process.env.SAHEL_RATE_LIMITS = JSON.stringify({ scale: 1000 });
      const { sessions } = await import('./session');
      sessionId = sessions.create().id;
    });

    // bigger than the biggest cap of all (the claim form with photos)
    const huge = JSON.stringify({ filler: 'x'.repeat(CLAIM_MAX_BODY_BYTES + 1024 * 1024) });
    const PARAMS: Record<string, string> = { id: 'x', paymentId: 'x', leadId: 'x', sellerId: 'nmc' };

    for (const r of routes) {
      it(`${r.method} ${r.path}`, async () => {
        const mod = (await import(r.file)) as Record<string, (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response> | Response>;
        const handler = mod[r.method]!;
        const call = async (extra: Record<string, string>) => {
          const req = new Request(`http://localhost/api/v1${r.path}`, {
            method: r.method,
            headers: { 'content-type': 'application/json', 'content-length': String(huge.length), 'X-Sahel-Session': sessionId, ...extra },
            body: huge,
          });
          return handler(req, { params: Promise.resolve(PARAMS) });
        };
        // Back-office routes check the role first: the first role the route accepts must then answer 413.
        const roles = r.path.startsWith('/backoffice') ? ['credit_officer', 'operations', 'compliance'] : [''];
        let res: Response | undefined;
        for (const role of roles) {
          res = await call(role ? { 'X-Sahel-Staff-Role': role } : {});
          if (res.status !== 401 && res.status !== 403) break;
        }
        expect(res!.status, `${r.method} ${r.path}`).toBe(413);
        const body = (await res!.json()) as { error: { code: string } };
        expect(body.error.code).toMatch(/^(PAYLOAD|BODY)_TOO_LARGE$/);
      });
    }
  });
});
