import { cookies } from 'next/headers';
import { customerOverview, newCustomerProfile, type CustomerProfile, type CustomerView } from '@sahel/domain';
import { contractSettings, handleError } from './api';
import { SessionStore } from './session-store';

/**
 * ⚠️ SANDBOX customer session, standing in for eKey / OIDC login.
 *
 * - Web: an opaque random id in an HttpOnly, SameSite=Lax cookie (`sahel_session`). The id is never readable
 *   by page scripts and never sent back in a header.
 * - Mobile: the `X-Sahel-Session` header. The app sends `X-Sahel-Session: new` until it has an id; the API
 *   answers with the id in the same header, and the app sends it on every later request (kept in memory for now;
 *   secure storage comes with the real login).
 *
 * Unknown or expired ids get a fresh session (a new id), so a client can never pick its own id.
 * Every session starts as the demo customer until it completes onboarding.
 */
export const SESSION_COOKIE = 'sahel_session';
export const SESSION_HEADER = 'X-Sahel-Session';

const g = globalThis as unknown as { __sahelSessions?: SessionStore };
export const sessions = (g.__sahelSessions ??= new SessionStore());

/**
 * THE current customer, as every API route and page sees them: the profile's overview (demo customer until
 * onboarding, then their own numbers) with this customer's contract settings (autopay) applied.
 * This is the only "current customer" helper: routes get it as `s.customer`, pages from `pageCustomerView()`.
 */
export function customerView(profile: CustomerProfile): CustomerView {
  return contractSettings.apply(customerOverview(profile));
}

export interface RequestSession {
  readonly customerId: string;
  readonly profile: CustomerProfile;
  /** customerView(profile): overview + contract settings */
  readonly customer: CustomerView;
  /** true when this request started the session */
  readonly created: boolean;
  /** Replace the session's profile (e.g. after onboarding). */
  update(fn: (p: CustomerProfile) => CustomerProfile): CustomerProfile;
  /** Adds the cookie (web) or header (mobile) that carries the session to the response. */
  attach<R extends Response>(res: R): R;
}

function cookieValue(header: string | null, name: string): string | undefined {
  for (const part of header?.split(';') ?? []) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return undefined;
}

function isHttps(req: Request): boolean {
  return new URL(req.url).protocol === 'https:' || req.headers.get('x-forwarded-proto') === 'https';
}

/** Resolves the customer session of an API request, creating one when there is none. */
export function customerSession(req: Request): RequestSession {
  const header = req.headers.get(SESSION_HEADER);
  const viaHeader = header !== null;
  const { session, created } = sessions.resolve(viaHeader ? header : cookieValue(req.headers.get('cookie'), SESSION_COOKIE));
  return {
    get customerId() {
      return session.profile.customerId;
    },
    get profile() {
      return session.profile;
    },
    get customer() {
      return customerView(session.profile);
    },
    created,
    update: (fn) => sessions.update(session.id, fn),
    attach(res) {
      if (viaHeader) {
        res.headers.set(SESSION_HEADER, session.id);
      } else if (created) {
        const secure = isHttps(req) ? '; Secure' : '';
        res.headers.append('Set-Cookie', `${SESSION_COOKIE}=${session.id}; Path=/; HttpOnly; SameSite=Lax${secure}`);
      }
      return res;
    },
  };
}

/**
 * Runs an API handler with the request's customer session: errors become problem responses (`onError`, default
 * handleError), and the response always carries the session (so a new session is kept even when the request fails).
 */
export async function withCustomer(
  req: Request,
  handler: (s: RequestSession) => Response | Promise<Response>,
  onError: (e: unknown) => Response = handleError,
): Promise<Response> {
  const s = customerSession(req);
  let res: Response;
  try {
    res = await handler(s);
  } catch (e) {
    res = onError(e);
  }
  return s.attach(res);
}

/** Customer id for pages rendered before the browser has a session: it owns nothing. */
const ANONYMOUS_CUSTOMER_ID = 'cus_anonymous';

/**
 * The customer profile for a server-rendered page, from the session cookie. Pages cannot set cookies, so a
 * browser without a session sees a fresh demo customer; its first API call starts the real session.
 */
export async function pageCustomer(): Promise<CustomerProfile> {
  const id = (await cookies()).get(SESSION_COOKIE)?.value;
  return sessions.get(id)?.profile ?? newCustomerProfile(ANONYMOUS_CUSTOMER_ID);
}

/** customerView() of the page's session customer (see pageCustomer). */
export async function pageCustomerView(): Promise<CustomerView> {
  return customerView(await pageCustomer());
}
