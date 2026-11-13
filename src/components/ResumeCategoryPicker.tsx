import { useEffect, useId, useState } from "react";
import { Check, Loader2, Pencil, Tag, X } from "lucide-react";
import { getResumeCategories, updateResume } from "../utils/Api";
import { useFeedback } from "./ui/Feedback";

/** Shows a resume's category and lets staff set, change or clear it in place. */
export default function ResumeCategoryPicker({
  resumeId,
  value,
  onSaved,
}: {
  resumeId: string;
  value?: string | null;
  onSaved: (updatedResume: any) => void;
}) {
  const { toast } = useFeedback();
  const listId = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");
  const [options, setOptions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editing && options.length === 0) getResumeCategories().then(setOptions);
  }, [editing, options.length]);

  const start = () => {
    setDraft(value || "");
    setEditing(true);
  };

  const save = async (next: string) => {
    const category = next.trim();
    if (category === (value || "")) return setEditing(false);
    try {
      setSaving(true);
      onSaved(await updateResume(resumeId, { category }));
      setEditing(false);
      toast(category ? `Category set to ${category}.` : "Category removed.", "success");
    } catch (err: any) {
      toast(err?.message || "Could not save the category.", "error");
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-slate-500 font-medium">Category:</span>
        {value ? (
          <span className="inline-flex items-center gap-1 font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-lg">
            <Tag size={11} /> {value}
          </span>
        ) : (
          <span className="text-slate-400">Not set</span>
        )}
        <button
          type="button"
          onClick={start}
          className="inline-flex items-center gap-1 text-indigo-600 font-semibold hover:underline"
        >
          <Pencil size={11} /> {value ? "Change" : "Set category"}
        </button>
      </div>
    );
  }

  return (
    <form
      className="flex flex-wrap items-center gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        save(draft);
      }}
    >
      <label htmlFor={`${listId}-input`} className="text-slate-500 font-medium">Category:</label>
      <input
        id={`${listId}-input`}
        autoFocus
        list={listId}
        value={draft}
        maxLength={60}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
        placeholder="Pick or type a category"
        className="w-48 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
      <datalist id={listId}>
        {options.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
      <button
        type="submit"
        disabled={saving}
        className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1 font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
      >
        {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Save
      </button>
      {value && (
        <button type="button" disabled={saving} onClick={() => save("")} className="font-semibold text-rose-600 hover:underline">
          Remove
        </button>
      )}
      <button type="button" onClick={() => setEditing(false)} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Cancel">
        <X size={12} />
      </button>
    </form>
  );
}
