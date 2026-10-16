export const AUTH_EXPIRED = "AUTH_EXPIRED";
export const SESSION_CHANGED = "SESSION_CHANGED";
function sessionChangedError() { const error = new Error("Session changed"); error.code = SESSION_CHANGED; return error; }
let generation = 0;
let controller = new AbortController();
export function captureSession() { return { generation, signal: controller.signal }; }
export function invalidateSession() {
  controller.abort(sessionChangedError());
  generation++;
  controller = new AbortController();
}
export function assertSession(snapshot) {
  if (snapshot && (snapshot.generation !== generation || snapshot.signal.aborted)) {
    throw sessionChangedError();
  }
}

export function createAuthError(reason = "Session expired") {
  const err = new Error(reason);
  err.code = AUTH_EXPIRED;
  return err;
}

export function isAuthError(err) {
  const msg = err?.message || String(err || "");
  return err?.code === AUTH_EXPIRED || /Cookie expired|No cookies|stale session|AUTH_EXPIRED|Session expired/i.test(msg);
}
