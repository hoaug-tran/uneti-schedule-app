export const AUTH_EXPIRED = "AUTH_EXPIRED";

export function createAuthError(reason = "Session expired") {
  const err = new Error(reason);
  err.code = AUTH_EXPIRED;
  return err;
}

export function isAuthError(err) {
  const msg = err?.message || String(err || "");
  return err?.code === AUTH_EXPIRED || /Cookie expired|No cookies|stale session|AUTH_EXPIRED|Session expired/i.test(msg);
}
