import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from "lucide-react";

/**
 * App-wide feedback: small corner messages (toasts) for results, and an in-app
 * dialog for questions that need an answer (e.g. "Delete this interview?").
 * Replaces the browser's alert() / confirm() boxes.
 */

type ToastKind = "success" | "error" | "info" | "warning";

interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
}

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface FeedbackApi {
  toast: (text: string, kind?: ToastKind) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const FeedbackContext = createContext<FeedbackApi | null>(null);

const KIND_STYLES: Record<ToastKind, { box: string; icon: ReactNode }> = {
  success: { box: "border-emerald-200 bg-emerald-50 text-emerald-900", icon: <CheckCircle2 size={18} className="text-emerald-600 shrink-0" /> },
  error: { box: "border-rose-200 bg-rose-50 text-rose-900", icon: <XCircle size={18} className="text-rose-600 shrink-0" /> },
  warning: { box: "border-amber-200 bg-amber-50 text-amber-900", icon: <AlertTriangle size={18} className="text-amber-600 shrink-0" /> },
  info: { box: "border-sky-200 bg-sky-50 text-sky-900", icon: <Info size={18} className="text-sky-600 shrink-0" /> },
};

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [dialog, setDialog] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((answer: boolean) => void) | null>(null);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((text: string, kind: ToastKind = "info") => {
    const id = nextId.current++;
    setToasts((list) => [...list.slice(-3), { id, kind, text }]);
    // Errors stay a little longer so they can be read
    setTimeout(() => dismiss(id), kind === "error" ? 7000 : 4000);
  }, [dismiss]);

  const confirm = useCallback((options: ConfirmOptions) => {
    setDialog(options);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const answer = (value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setDialog(null);
  };

  return (
    <FeedbackContext.Provider value={{ toast, confirm }}>
      {children}

      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-[min(360px,calc(100vw-2rem))]" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 shadow-lg text-sm ${KIND_STYLES[t.kind].box}`}>
            {KIND_STYLES[t.kind].icon}
            <span className="flex-1 whitespace-pre-line">{t.text}</span>
            <button onClick={() => dismiss(t.id)} aria-label="Dismiss message" className="opacity-60 hover:opacity-100 cursor-pointer">
              <X size={16} />
            </button>
          </div>
        ))}
      </div>

      {dialog && (
        <div className="fixed inset-0 z-[110] bg-slate-900/40 flex items-center justify-center p-4" onClick={() => answer(false)}>
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="confirm-title" className="text-base font-bold text-slate-900">{dialog.title}</h2>
            {dialog.message && <p className="text-sm text-slate-600 whitespace-pre-line">{dialog.message}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button
                autoFocus
                onClick={() => answer(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                {dialog.cancelLabel || "Cancel"}
              </button>
              <button
                onClick={() => answer(true)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold text-white cursor-pointer ${dialog.danger ? "bg-rose-600 hover:bg-rose-700" : "bg-indigo-600 hover:bg-indigo-700"}`}
              >
                {dialog.confirmLabel || "OK"}
              </button>
            </div>
          </div>
        </div>
      )}
    </FeedbackContext.Provider>
  );
}

export function useFeedback(): FeedbackApi {
  const api = useContext(FeedbackContext);
  if (!api) throw new Error("useFeedback must be used inside <FeedbackProvider>");
  return api;
}
