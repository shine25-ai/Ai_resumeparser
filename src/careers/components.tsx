import { useEffect, useRef, type ClipboardEvent, type KeyboardEvent, type ReactNode } from "react";

/** Building blocks of the public careers site: text helpers, labels and the code input used by the apply page. */

export const ACCEPTED = ".pdf,.doc,.docx";
export const MAX_BYTES = 10 * 1024 * 1024;
export const RESEND_SECONDS = 60; // matches the server's resend cooldown

export const primaryBtn =
  "flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--cp-brand)] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[var(--cp-brand-dark)] disabled:cursor-not-allowed disabled:bg-[var(--cp-brand)]/30";

// ── Helpers ─────────────────────────────────────────────────────────────────

export const postedAgo = (iso: string) => {
  if (!iso) return "";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (Number.isNaN(days)) return "";
  if (days <= 0) return "Posted today";
  if (days === 1) return "Posted 1d ago";
  if (days < 30) return `Posted ${days}d ago`;
  const months = Math.floor(days / 30);
  return `Posted ${months}mo ago`;
};

export const openingsLabel = (n: number) => `${n} ${n === 1 ? "opening" : "openings"}`;

export const formatBytes = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

/** Renders a plain-text description: blank lines split paragraphs, lines starting with - or • become bullets. */
export function Description({ text }: { text: string }) {
  const blocks = text.trim().split(/\n\s*\n/);
  return (
    <div className="space-y-3 text-sm leading-6 text-slate-600">
      {blocks.map((block, i) => {
        const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
        const bullets = lines.every((l) => /^[-•*]\s+/.test(l));
        if (bullets) {
          return (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {lines.map((l, j) => <li key={j}>{l.replace(/^[-•*]\s+/, "")}</li>)}
            </ul>
          );
        }
        return <p key={i} className="whitespace-pre-line">{lines.join("\n")}</p>;
      })}
    </div>
  );
}

// ── Layout pieces ───────────────────────────────────────────────────────────

export function Meta({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="flex min-w-0 items-center gap-2 text-sm text-slate-600">
      <span className="shrink-0 text-slate-400">{icon}</span>
      <span className="truncate">{children}</span>
    </span>
  );
}

export function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="shrink-0 rounded-full bg-[var(--cp-brand-soft)] px-2.5 py-1 text-xs font-medium text-[var(--cp-brand)]">{children}</span>
  );
}

/** Six boxes for the emailed code; pasting a whole code fills them all. */
export function OtpInput({ value, onChange, onComplete }: { value: string; onChange: (v: string) => void; onComplete: () => void }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length: 6 }, (_, i) => value[i] ?? "");

  useEffect(() => refs.current[0]?.focus(), []);

  const setAt = (index: number, digit: string) => {
    const next = digits.slice();
    next[index] = digit;
    const joined = next.join("").slice(0, 6);
    onChange(joined);
    return joined;
  };

  const handleChange = (index: number, raw: string) => {
    const digit = raw.replace(/\D/g, "").slice(-1);
    if (!digit) return;
    const joined = setAt(index, digit);
    if (index < 5) refs.current[index + 1]?.focus();
    else if (joined.length === 6) onComplete();
  };

  const handleKey = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      if (digits[index]) setAt(index, "");
      else if (index > 0) {
        setAt(index - 1, "");
        refs.current[index - 1]?.focus();
      }
    } else if (e.key === "ArrowLeft" && index > 0) refs.current[index - 1]?.focus();
    else if (e.key === "ArrowRight" && index < 5) refs.current[index + 1]?.focus();
    else if (e.key === "Enter" && value.length === 6) onComplete();
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    e.preventDefault();
    onChange(pasted);
    refs.current[Math.min(pasted.length, 5)]?.focus();
  };

  return (
    <div className="grid grid-cols-6 gap-2" role="group" aria-label="6-digit verification code">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          aria-label={`Digit ${i + 1}`}
          value={d}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKey(i, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
          className="h-12 w-full rounded-lg border border-slate-300 text-center text-lg font-semibold text-slate-900 focus:border-[var(--cp-brand)] focus:outline-none focus:ring-2 focus:ring-[var(--cp-brand)]/20"
        />
      ))}
    </div>
  );
}
