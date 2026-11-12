import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Pencil, Plus, RefreshCw, X } from "lucide-react";
import {
  createJobOpening,
  fetchJobApplications,
  fetchJobOpenings,
  updateJobOpening,
  type JobApplicationRow,
  type JobOpening,
} from "../utils/jobsApi";

const PAGE_SIZE = 20;

export default function JobOpenings() {
  const [openings, setOpenings] = useState<JobOpening[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string>("");
  const [applications, setApplications] = useState<JobApplicationRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const emptyForm = { title: "", department: "", location: "", employment_type: "", experience: "", description: "", open_positions: "1" };
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadOpenings = async () => {
    setLoading(true);
    try {
      setOpenings(await fetchJobOpenings());
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load job openings.");
    } finally {
      setLoading(false);
    }
  };

  const loadApplications = async () => {
    try {
      const data = await fetchJobApplications(selectedId, page, PAGE_SIZE);
      setApplications(data.items);
      setTotal(data.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load applications.");
    }
  };

  useEffect(() => {
    loadOpenings();
  }, []);

  useEffect(() => {
    loadApplications();
  }, [selectedId, page]);

  const savePositions = async (opening: JobOpening) => {
    const value = Number(draft[opening.id] ?? opening.open_positions);
    if (!Number.isInteger(value) || value < 0) {
      setError("Open positions must be a whole number, 0 or more.");
      return;
    }
    try {
      await updateJobOpening(opening.id, { open_positions: value });
      setDraft((d) => {
        const next = { ...d };
        delete next[opening.id];
        return next;
      });
      await loadOpenings();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update the opening.");
    }
  };

  const toggleStatus = async (opening: JobOpening) => {
    try {
      await updateJobOpening(opening.id, { status: opening.status === "OPEN" ? "CLOSED" : "OPEN" });
      await loadOpenings();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update the opening.");
    }
  };

  const startEdit = (opening: JobOpening) => {
    setEditingId(opening.id);
    setForm({
      title: opening.title,
      department: opening.department || "",
      location: opening.location || "",
      employment_type: opening.employment_type || "",
      experience: opening.experience || "",
      description: opening.description || "",
      open_positions: String(opening.open_positions),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(emptyForm);
  };

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    const payload = {
      title: form.title.trim(),
      department: form.department.trim(),
      location: form.location.trim(),
      employment_type: form.employment_type.trim(),
      experience: form.experience.trim(),
      description: form.description.trim(),
      open_positions: Number(form.open_positions) || 0,
    };
    try {
      if (editingId) await updateJobOpening(editingId, payload);
      else await createJobOpening(payload);
      setEditingId(null);
      setForm(emptyForm);
      setError("");
      await loadOpenings();
    } catch (e) {
      setError(e instanceof Error ? e.message : editingId ? "Could not update the opening." : "Could not create the opening.");
    } finally {
      setSaving(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6 font-sans text-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Job openings</h1>
          <p className="text-sm text-slate-500">
            Public list:{" "}
            <Link to="/jobs" className="text-indigo-600 hover:underline" target="_blank">
              /jobs
            </Link>
          </p>
        </div>
        <button onClick={loadOpenings} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50">
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      {error && <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-semibold">{editingId ? `Edit role: ${openings.find((o) => o.id === editingId)?.title ?? ""}` : "Add a role"}</h2>
          {editingId && (
            <button type="button" onClick={cancelEdit} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
              <X size={14} /> Cancel edit
            </button>
          )}
        </div>
        <form onSubmit={create} className="grid gap-3 md:grid-cols-6">
          <input required placeholder="Job title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 md:col-span-2" />
          <input placeholder="Department" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2" />
          <input placeholder="Location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2" />
          <input placeholder="Type (Full time…)" value={form.employment_type} onChange={(e) => setForm({ ...form, employment_type: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2" />
          <input placeholder="Experience (2-4 years)" value={form.experience} onChange={(e) => setForm({ ...form, experience: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2" />
          <textarea
            placeholder={"Role details shown on the careers page. Blank lines start a new paragraph; lines starting with - become bullets."}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={4}
            maxLength={5000}
            className="rounded-lg border border-slate-300 px-3 py-2 md:col-span-5"
          />
          <div className="flex items-start gap-2">
            <label className="flex flex-col text-xs text-slate-500">
              Open positions
              <input type="number" min={0} value={form.open_positions} onChange={(e) => setForm({ ...form, open_positions: e.target.value })} className="mt-1 w-20 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800" />
            </label>
            <button disabled={saving} className="mt-5 inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
              {editingId ? "Save" : <><Plus size={16} /> Add</>}
            </button>
          </div>
        </form>
      </section>

      <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Open positions</th>
              <th className="px-4 py-3">Applications</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td className="px-4 py-6 text-slate-500" colSpan={5}>Loading…</td></tr>
            )}
            {!loading && openings.length === 0 && (
              <tr><td className="px-4 py-6 text-slate-500" colSpan={5}>No roles yet. Add one above.</td></tr>
            )}
            {openings.map((o) => (
              <tr key={o.id} className="border-t border-slate-100">
                <td className="px-4 py-3">
                  <button onClick={() => { setSelectedId(o.id); setPage(1); }} className={`text-left font-medium hover:underline ${selectedId === o.id ? "text-indigo-700" : "text-slate-900"}`}>
                    {o.title}
                  </button>
                  <div className="text-xs text-slate-500">{[o.department, o.location, o.employment_type, o.experience].filter(Boolean).join(" · ")}</div>
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${o.status === "OPEN" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                    {o.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      aria-label={`Open positions for ${o.title}`}
                      value={draft[o.id] ?? o.open_positions}
                      onChange={(e) => setDraft({ ...draft, [o.id]: e.target.value })}
                      className="w-20 rounded-lg border border-slate-300 px-2 py-1"
                    />
                    {draft[o.id] !== undefined && draft[o.id] !== "" && Number(draft[o.id]) !== o.open_positions && (
                      <button onClick={() => savePositions(o)} className="rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white">Save</button>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 font-semibold">{o.applications_count}</td>
                <td className="space-x-3 whitespace-nowrap px-4 py-3 text-right">
                  <button onClick={() => startEdit(o)} className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:underline">
                    <Pencil size={12} /> Edit
                  </button>
                  <button onClick={() => toggleStatus(o)} className="text-xs font-medium text-indigo-600 hover:underline">
                    {o.status === "OPEN" ? "Close role" : "Reopen role"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
          <h2 className="font-semibold">
            Applications {selectedId ? `for ${openings.find((o) => o.id === selectedId)?.title ?? "selected role"}` : "(all roles)"}
          </h2>
          <div className="flex items-center gap-2">
            {selectedId && (
              <button onClick={() => { setSelectedId(""); setPage(1); }} className="text-sm text-slate-500 hover:underline">Show all</button>
            )}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3">Applicant</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Submitted</th>
                <th className="px-4 py-3">Resume</th>
              </tr>
            </thead>
            <tbody>
              {applications.length === 0 && (
                <tr><td className="px-4 py-6 text-slate-500" colSpan={5}>No applications yet.</td></tr>
              )}
              {applications.map((a) => (
                <tr key={a.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">{a.full_name || "—"}{a.phone && <div className="text-xs text-slate-500">{a.phone}</div>}</td>
                  <td className="px-4 py-3">{a.applicant_email}</td>
                  <td className="px-4 py-3">{a.opening_title}</td>
                  <td className="px-4 py-3">{new Date(a.submitted_at).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    {a.candidate_id ? (
                      <Link to={`/candidates/${a.resume_id}`} className="text-indigo-600 hover:underline">
                        {a.candidate_id} · {a.resume_status}
                      </Link>
                    ) : (
                      <span className="text-slate-500">{a.resume_status === "MERGED" ? "Merged into existing profile" : a.resume_status}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {total > PAGE_SIZE && (
          <div className="flex items-center justify-end gap-3 border-t border-slate-100 p-3 text-sm">
            <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="disabled:opacity-40">Previous</button>
            <span>Page {page} of {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="disabled:opacity-40">Next</button>
          </div>
        )}
      </section>
    </div>
  );
}
