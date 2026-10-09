export const SESSION_EXPIRED_EVENT = "session-expired";

// Returns the access token's expiry as epoch milliseconds, or null if there is
// no token or it cannot be decoded.
export const getAccessTokenExpiry = (): number | null => {
  const token = localStorage.getItem("access_token");
  if (!token) return null;

  try {
    const payload = token.split(".")[1];
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const { exp } = JSON.parse(atob(padded));
    return typeof exp === "number" ? exp * 1000 : null;
  } catch {
    return null;
  }
};

export const clearSession = () => {
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
  localStorage.removeItem("user");
};

// Called when the backend rejects a request as unauthenticated, so the user is
// told the session has expired instead of being silently redirected.
export const notifySessionExpired = () => {
  window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
};
