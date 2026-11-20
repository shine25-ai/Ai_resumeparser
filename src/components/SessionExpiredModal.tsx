import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Clock, LogIn, AlertTriangle, RefreshCw, Sparkles, X } from "lucide-react";
import {
  SESSION_EXPIRED_EVENT,
  SESSION_REFRESHED_EVENT,
  clearSession,
  getAccessTokenExpiry,
  refreshSessionToken,
} from "../utils/session";
import { useFeedback } from "./ui/Feedback";

// 5 minutes warning before expiration
const WARNING_THRESHOLD_MS = 5 * 60 * 1000;
// setTimeout overflows above this delay and would fire immediately
const MAX_TIMEOUT_MS = 2_147_483_647;

export default function SessionExpiredModal() {
  const { toast } = useFeedback();
  const navigate = useNavigate();
  const location = useLocation();

  const [expired, setExpired] = useState(false);
  const [warning, setWarning] = useState(false);
  const [dismissedWarning, setDismissedWarning] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(0);
  const [isExtending, setIsExtending] = useState(false);

  useEffect(() => {
    let timer: number | undefined;

    const check = () => {
      window.clearTimeout(timer);
      const expiresAt = getAccessTokenExpiry();
      if (expiresAt === null) {
        setExpired(false);
        setWarning(false);
        return;
      }

      const remaining = expiresAt - Date.now();
      if (remaining <= 0) {
        setExpired(true);
        setWarning(false);
        return;
      }

      setExpired(false);
      setSecondsRemaining(Math.max(0, Math.floor(remaining / 1000)));

      if (remaining <= WARNING_THRESHOLD_MS) {
        setWarning(true);
        // Poll every second while in the warning window to show accurate countdown
        timer = window.setTimeout(check, 1000);
      } else {
        setWarning(false);
        setDismissedWarning(false);
        // Wake up exactly when the warning threshold starts
        const timeUntilWarning = remaining - WARNING_THRESHOLD_MS;
        timer = window.setTimeout(check, Math.min(timeUntilWarning, MAX_TIMEOUT_MS));
      }
    };

    const onRejected = () => {
      setExpired(true);
      setWarning(false);
    };

    const onRefreshed = () => {
      setExpired(false);
      setWarning(false);
      setDismissedWarning(false);
      check();
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };

    check();
    window.addEventListener(SESSION_EXPIRED_EVENT, onRejected);
    window.addEventListener(SESSION_REFRESHED_EVENT, onRefreshed);
    window.addEventListener("focus", check);
    window.addEventListener("storage", check);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(SESSION_EXPIRED_EVENT, onRejected);
      window.removeEventListener(SESSION_REFRESHED_EVENT, onRefreshed);
      window.removeEventListener("focus", check);
      window.removeEventListener("storage", check);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const handleExtend = async () => {
    setIsExtending(true);
    try {
      const ok = await refreshSessionToken();
      if (ok) {
        setWarning(false);
        setDismissedWarning(false);
        toast("Session extended for another 12 hours. Your work is safe!", "success");
      } else {
        toast("Could not extend session. Please save your work and log in again.", "warning");
      }
    } finally {
      setIsExtending(false);
    }
  };

  const handleLogin = () => {
    clearSession();
    navigate("/login", { replace: true, state: { from: location.pathname } });
  };

  // Full screen Modal when session has expired
  if (expired) {
    return (
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="session-expired-title"
        aria-describedby="session-expired-description"
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[300]"
      >
        <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl p-7 text-center border border-slate-200 animate-in zoom-in-95 duration-200">
          <div className="inline-flex p-3 bg-amber-50 text-amber-600 rounded-2xl mb-4 border border-amber-200">
            <Clock className="w-7 h-7" />
          </div>
          <h3 id="session-expired-title" className="text-xl font-black text-slate-900 mb-2">
            Session Expired
          </h3>
          <p id="session-expired-description" className="text-xs text-slate-600 mb-6 leading-relaxed">
            Your login session has ended. To protect your work and data security, please log in again. All your draft ratings and feedback have been safely auto-saved.
          </p>
          <button
            autoFocus
            onClick={handleLogin}
            className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl shadow-md transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer text-xs active:scale-95"
          >
            <LogIn className="w-4 h-4" />
            <span>Log in again</span>
          </button>
        </div>
      </div>
    );
  }

  // Pre-expiry Warning Modal (5 minutes before expiration)
  if (warning && !dismissedWarning) {
    const minutes = Math.floor(secondsRemaining / 60);
    const seconds = secondsRemaining % 60;
    const timeDisplay = `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;

    return (
      <div
        role="alertdialog"
        aria-modal="true"
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-[250] animate-in fade-in duration-200"
      >
        <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl p-6 sm:p-7 border border-amber-200 animate-in zoom-in-95 duration-200 text-slate-900 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center shrink-0">
                <AlertTriangle size={22} />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">
                  Session Expiring Soon
                </h3>
                <span className="inline-block mt-0.5 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                  Expiring in {timeDisplay}
                </span>
              </div>
            </div>
            <button
              onClick={() => setDismissedWarning(true)}
              className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
              title="Dismiss warning"
            >
              <X size={16} />
            </button>
          </div>

          <p className="text-xs text-slate-600 font-medium leading-relaxed">
            Your login session will expire in <strong>{timeDisplay}</strong>. All your current inputs are being auto-saved. Click <strong>Extend Session</strong> below to stay logged in and keep working without interruption.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setDismissedWarning(true)}
              className="w-full sm:w-auto px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              Continue Working
            </button>
            <button
              type="button"
              disabled={isExtending}
              onClick={handleExtend}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-extrabold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-all cursor-pointer active:scale-95 disabled:opacity-50"
            >
              {isExtending ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  <span>Extending...</span>
                </>
              ) : (
                <>
                  <Sparkles size={14} />
                  <span>Extend Session (12 hrs)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Floating reminder pill if the warning dialog was dismissed
  if (warning && dismissedWarning) {
    const minutes = Math.floor(secondsRemaining / 60);
    const seconds = secondsRemaining % 60;
    const timeDisplay = `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;

    return (
      <div className="fixed bottom-5 right-5 z-[250] animate-in slide-in-from-bottom-3 duration-200">
        <div className="flex items-center gap-3 bg-amber-500 text-white px-4 py-2.5 rounded-2xl shadow-xl font-bold text-xs border border-amber-400">
          <AlertTriangle size={15} className="shrink-0 animate-pulse text-amber-100" />
          <span>Session expires in {timeDisplay}</span>
          <button
            onClick={handleExtend}
            disabled={isExtending}
            className="px-2.5 py-1 bg-white text-amber-800 hover:bg-amber-50 rounded-lg text-xs font-extrabold transition-all cursor-pointer shadow-2xs"
          >
            {isExtending ? "Extending..." : "Extend Now"}
          </button>
        </div>
      </div>
    );
  }

  return null;
}
