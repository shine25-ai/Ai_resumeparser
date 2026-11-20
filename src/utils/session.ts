export const SESSION_EXPIRED_EVENT = "session-expired";
export const SESSION_WARNING_EVENT = "session-warning";
export const SESSION_REFRESHED_EVENT = "session-refreshed";

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

// Refreshes the JWT access token using the stored refresh token
export const refreshSessionToken = async (): Promise<boolean> => {
  const refreshToken = localStorage.getItem("refresh_token");
  if (!refreshToken) return false;

  try {
    const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000/api/v1";
    const response = await fetch(`${BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    const resData = await response.json().catch(() => ({}));
    if (response.ok && resData?.data?.access_token) {
      localStorage.setItem("access_token", resData.data.access_token);
      if (resData.data.refresh_token) {
        localStorage.setItem("refresh_token", resData.data.refresh_token);
      }
      window.dispatchEvent(new Event(SESSION_REFRESHED_EVENT));
      return true;
    }
    return false;
  } catch (err) {
    console.error("Failed to refresh session token:", err);
    return false;
  }
};
