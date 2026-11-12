import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { shareInterviewSummary } from "../../utils/Api";
import { useFeedback } from "../ui/Feedback";

/**
 * Email a summary of the selected interviews (with an Excel/CSV attachment).
 * This was on the old Interview Dashboard ("Email Interview Status") and is now
 * on the Interviews page's selection bar.
 */
interface ShareSummaryDialogProps {
  interviewIds: string[];
  onClose: () => void;
  onSent: () => void;
}

export function ShareSummaryDialog({ interviewIds, onClose, onSent }: ShareSummaryDialogProps) {
  const { toast } = useFeedback();
  const [emails, setEmails] = useState("");
  const [notes, setNotes] = useState("");
  const [format, setFormat] = useState<"xlsx" | "csv" | "none">("xlsx");
  const [sending, setSending] = useState(false);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const list = emails.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);
    const bad = list.filter((x) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x));
    if (list.length === 0) return toast("Add at least one email address.", "warning");
    if (bad.length) return toast(`Check these addresses: ${bad.join(", ")}`, "warning");
    setSending(true);
    try {
      const res = await shareInterviewSummary({
        interview_ids: interviewIds,
        to_emails: list,
        notes: notes.trim() || undefined,
        attachment_format: format,
      });
      toast(res?.message || "Interview summary sent.", "success");
      onSent();
      onClose();
    } catch (err: any) {
      toast(err?.message || "Could not send the summary email.", "error");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4" onClick={onClose}>
      <form
        onSubmit={send}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-title"
        className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-4"
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 id="share-title" className="text-base font-bold text-slate-900">Email interview summary</h2>
            <p className="text-sm text-slate-500">{interviewIds.length} selected interview{interviewIds.length === 1 ? "" : "s"}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 text-slate-500 hover:text-slate-800 cursor-pointer">
            <X size={18} />
          </button>
        </div>
        <div>
          <label htmlFor="share-emails" className="block text-xs font-semibold text-slate-600 mb-1">Send to *</label>
          <input
            id="share-emails"
            value={emails}
            onChange={(e) => setEmails(e.target.value)}
            placeholder="hiring.manager@company.com, client@company.com"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
          />
        </div>
        <div>
          <label htmlFor="share-notes" className="block text-xs font-semibold text-slate-600 mb-1">Notes</label>
          <textarea
            id="share-notes"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
          />
        </div>
        <div>
          <label htmlFor="share-format" className="block text-xs font-semibold text-slate-600 mb-1">Attachment</label>
          <select
            id="share-format"
            value={format}
            onChange={(e) => setFormat(e.target.value as "xlsx" | "csv" | "none")}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="xlsx">Excel (.xlsx)</option>
            <option value="csv">CSV</option>
            <option value="none">No attachment</option>
          </select>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700 cursor-pointer">
            Cancel
          </button>
          <button type="submit" disabled={sending} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-60 cursor-pointer">
            {sending && <Loader2 size={14} className="animate-spin" />} Send
          </button>
        </div>
      </form>
    </div>
  );
}
