import { useEffect, useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { DEFAULT_PAGE_SETTINGS, type CareersPageSettings } from "../../careers/api";
import { fetchCareersPageSettings, updateCareersPageSettings } from "../../utils/jobsApi";

/** Text on the public careers page. The header and footer are fixed; everything listed here can be changed. */
const FIELDS: { key: Exclude<keyof CareersPageSettings, "company">; label: string; group: string; long?: boolean }[] = [
  { key: "hero_eyebrow", label: "Small heading above the title", group: "Top of the page" },
  { key: "hero_title", label: "Title", group: "Top of the page" },
  { key: "hero_subtitle", label: "Subtitle", group: "Top of the page", long: true },
  { key: "search_placeholder", label: "Search box hint", group: "Top of the page" },
  { key: "listing_title", label: "Title", group: "Role list" },
  { key: "listing_subtitle", label: "Subtitle", group: "Role list", long: true },
  { key: "empty_message", label: "Message when no roles are open", group: "Role list", long: true },
  { key: "success_title", label: "Title", group: "After applying", long: false },
  { key: "success_message", label: "Message", group: "After applying", long: true },
];

const GROUPS = Array.from(new Set(FIELDS.map((f) => f.group)));

/** Text of one company's careers page. Give it key={companyId} so switching company loads that company's text. */
export default function CareersPageSettingsPanel({ companyId, companyName }: { companyId?: string; companyName?: string }) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<CareersPageSettings | null>(null);
  // The small heading defaults to "Careers at <company>".
  const defaults: CareersPageSettings = companyName
    ? { ...DEFAULT_PAGE_SETTINGS, hero_eyebrow: `Careers at ${companyName}` }
    : DEFAULT_PAGE_SETTINGS;
  const [form, setForm] = useState<CareersPageSettings>(defaults);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (!open || saved) return;
    fetchCareersPageSettings(companyId)
      .then((data) => {
        setSaved(data);
        setForm(data);
      })
      .catch((e) => setMessage({ kind: "error", text: e instanceof Error ? e.message : "Could not load the careers page text." }));
  }, [open, saved, companyId]);

  const changed = saved ? FIELDS.filter((f) => form[f.key] !== saved[f.key]) : [];

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const changes = Object.fromEntries(changed.map((f) => [f.key, form[f.key]]));
      const data = await updateCareersPageSettings(changes, companyId);
      setSaved(data);
      setForm(data);
      setMessage({ kind: "ok", text: "Saved. The careers page shows the new text now." });
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof Error ? e.message : "Could not save." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 p-5 text-left"
      >
        <div>
          <h2 className="font-semibold">Careers page text{companyName ? ` · ${companyName}` : ""}</h2>
          <p className="text-sm text-slate-500">Headings and messages on the public careers page. The header and footer stay the same.</p>
        </div>
        <ChevronDown size={18} className={`shrink-0 text-slate-500 transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="space-y-5 border-t border-slate-100 p-5">
          {!saved && !message && (
            <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" /> Loading…</p>
          )}
          {saved &&
            GROUPS.map((group) => (
              <fieldset key={group}>
                <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{group}</legend>
                <div className="grid gap-3 md:grid-cols-2">
                  {FIELDS.filter((f) => f.group === group).map((f) => (
                    <label key={f.key} className={`flex flex-col gap-1 ${f.long ? "md:col-span-2" : ""}`}>
                      <span className="flex items-center justify-between text-xs font-medium text-slate-600">
                        {f.label}
                        {form[f.key] !== defaults[f.key] && (
                          <button
                            type="button"
                            onClick={() => setForm({ ...form, [f.key]: defaults[f.key] })}
                            className="font-normal text-indigo-600 hover:underline"
                          >
                            Use default
                          </button>
                        )}
                      </span>
                      <input
                        value={form[f.key]}
                        maxLength={f.long ? 300 : 150}
                        placeholder={defaults[f.key]}
                        onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                      />
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}

          {message && (
            <p className={`rounded-lg px-3 py-2 text-sm ${message.kind === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
              {message.text}
            </p>
          )}

          {saved && (
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={!changed.length || busy}
                onClick={() => setForm(saved)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                Discard changes
              </button>
              <button
                type="button"
                disabled={!changed.length || busy}
                onClick={save}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {busy && <Loader2 size={14} className="animate-spin" />} Save page text
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
