import { BACKOFFICE_ERROR_STATUS, BackOfficeError, type BackOfficeErrorCode } from '@sahel/domain';
import { handleError, problem } from './api';

/**
 * handleError plus the back-office errors (401 not signed in, 403 wrong role, ...). Matched by name too: the
 * sandbox stores live on globalThis and may have been created by another route's bundle.
 */
export function handleBackOfficeError(e: unknown) {
  if (e instanceof BackOfficeError || (e instanceof Error && e.name === 'BackOfficeError')) {
    const code = (e as BackOfficeError).code as BackOfficeErrorCode;
    return problem(BACKOFFICE_ERROR_STATUS[code] ?? 422, code, e.message);
  }
  return handleError(e);
}
