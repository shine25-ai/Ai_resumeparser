import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Clock, LogIn } from "lucide-react";
import { SESSION_EXPIRED_EVENT, clearSession, getAccessTokenExpiry } from "../utils/session";

// setTimeout overflows above this delay and would fire immediately
const MAX_TIMEOUT_MS = 2_147_483_647;

export default function SessionExpiredModal() {
  const navigate = useNavigate();
  const location = useLocation();
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    let timer: number | undefined;

    const check = () => {
      window.clearTimeout(timer);
      const expiresAt = getAccessTokenExpiry();
      if (expiresAt === null) return;

      const remaining = expiresAt - Date.now();
      if (remaining <= 0) {
        setExpired(true);
        return;
      }
      setExpired(false);
      timer = window.setTimeout(check, Math.min(remaining, MAX_TIMEOUT_MS));
    };

    const onRejected = () => setExpired(true);
    // Timers are paused while the tab is hidden or the machine sleeps
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };

    check();
    window.addEventListener(SESSION_EXPIRED_EVENT, onRejected);
    window.addEventListener("focus", check);
    window.addEventListener("storage", check);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(SESSION_EXPIRED_EVENT, onRejected);
      window.removeEventListener("focus", check);
      window.removeEventListener("storage", check);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (!expired) return null;

  const handleLogin = () => {
    clearSession();
    navigate("/login", { replace: true, state: { from: location.pathname } });
  };

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="session-expired-title"
      aria-describedby="session-expired-description"
      className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-[100]"
    >
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-xl p-8 text-center">
        <div className="inline-flex p-3 bg-amber-50 text-amber-600 rounded-full mb-4">
          <Clock className="w-6 h-6" />
        </div>
        <h3 id="session-expired-title" className="text-xl font-semibold text-slate-800 mb-2">
          Session expired
        </h3>
        <p id="session-expired-description" className="text-sm text-slate-600 mb-6">
          Your session has expired. Please log in again to continue.
        </p>
        <button
          autoFocus
          onClick={handleLogin}
          className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl shadow-md transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer text-sm"
        >
          <LogIn className="w-4 h-4" />
          <span>Log in again</span>
        </button>
      </div>
    </div>
  );
}
