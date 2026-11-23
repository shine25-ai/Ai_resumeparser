import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Copy, Loader2, Mail, RotateCw, Send, X } from "lucide-react";
import { useFeedback } from "./ui/Feedback";
import type { RoleItem } from "../utils/Api";
import {
  cancelInvitation,
  fetchInvitations,
  fetchMasters,
  inviteUser,
  resendInvitation,
  type Invitation,
  type MasterEntry,
} from "../utils/adminApi";

/** Invite users by email and see pending invitations (SRS Screen 19). */

const input = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none";

export function useDepartments() {
  const [departments, setDepartments] = useState<MasterEntry[]>([]);
  useEffect(() => {
    fetchMasters("department").then(setDepartments).catch(() => setDepartments([]));
  }, []);
  return departments;
}

const statusClass: Record<Invitation["status"], string> = {
  pending: "bg-amber-50 text-amber-700",
  accepted: "bg-emerald-50 text-emerald-700",
  revoked: "bg-slate-100 text-slate-600",
  expired: "bg-rose-50 text-rose-700",
};

export default function InvitationsPanel({ roles, onAccepted }: { roles: RoleItem[]; onAccepted?: () => void }) {
  const { toast, confirm } = useFeedback();
  const departments = useDepartments();
  const [items, setItems] = useState<Invitation[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: "", full_name: "", role: "", department: "" });
  const [saving, setSaving] = useState(false);
  const [lastLink, setLastLink] = useState<{ email: string; link: string } | null>(null);

  const assignable = roles.filter((r) => (r.slug || "").toLowerCase() !== "superadmin");

  const load = useCallback(async () => {
    try {
      setItems(await fetchInvitations());
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!form.role && assignable.length) setForm((f) => ({ ...f, role: assignable.find((r) => r.slug === "recruiter")?.slug || assignable[0].slug }));
  }, [assignable, form.role]);

  const showResult = (inv: Invitation) => {
    if (inv.invite_link) {
      setLastLink({ email: inv.email, link: inv.invite_link });
      toast("Email isn't set up, so copy the link and send it yourself.", "info");
    } else {
      setLastLink(null);
      toast(`Invitation emailed to ${inv.email}.`, "success");
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const inv = await inviteUser(form);
      showResult(inv);
      setForm((f) => ({ ...f, email: "", full_name: "" }));
      setOpen(false);
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not send the invitation.", "error");
    } finally {
      setSaving(false);
    }
  };

  const resend = async (inv: Invitation) => {
    try {
      showResult(await resendInvitation(inv.id));
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not resend.", "error");
    }
  };

  const cancel = async (inv: Invitation) => {
    if (!(await confirm({ title: `Cancel the invitation for ${inv.email}?`, message: "The link stops working.", confirmLabel: "Cancel invitation", danger: true }))) return;
    try {
      await cancelInvitation(inv.id);
      toast("Invitation cancelled.", "success");
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not cancel.", "error");
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast("Link copied.", "success");
    } catch {
      toast("Select the link and copy it.", "info");
    }
  };

  const pending = items.filter((i) => i.status === "pending" || i.status === "expired");
  const accepted = items.filter((i) => i.status === "accepted").length;

  useEffect(() => {
    if (accepted && onAccepted) onAccepted();
  }, [accepted, onAccepted]);

  return (
    <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Invitations</h3>
          <p className="text-xs text-slate-500">{pending.filter((p) => p.status === "pending").length} pending · invited people choose their own password</p>
        </div>
        <button onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700">
          {open ? <X size={15} /> : <Mail size={15} />} Invite user
        </button>
      </div>

      {open && (
        <form onSubmit={submit} className="mt-3 grid gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-[1.4fr_1fr_1fr_1fr_auto]">
          <input required type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={input} />
          <input placeholder="Name (optional)" maxLength={100} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className={input} />
          <select required value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className={input} aria-label="Role">
            {assignable.map((r) => <option key={r.id} value={r.slug}>{r.name}</option>)}
          </select>
          <select value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} className={input} aria-label="Department">
            <option value="">No department</option>
            {departments.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
          </select>
          <button disabled={saving} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Send
          </button>
        </form>
      )}

      {lastLink && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <span>Link for <b>{lastLink.email}</b> (works once, expires in 7 days):</span>
          <code className="min-w-0 flex-1 truncate rounded bg-white px-2 py-1 text-[11px] text-slate-700">{lastLink.link}</code>
          <button onClick={() => copy(lastLink.link)} className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-2 py-1 font-medium"><Copy size={12} /> Copy</button>
        </div>
      )}

      {pending.length > 0 && (
        <ul className="mt-3 divide-y divide-slate-100 text-sm">
          {pending.map((inv) => (
            <li key={inv.id} className="flex flex-wrap items-center gap-2 py-2">
              <span className="min-w-0 flex-1 truncate">
                <b className="text-slate-800">{inv.email}</b>
                <span className="text-slate-500"> · {roles.find((r) => r.slug === inv.role)?.name || inv.role}{inv.department ? ` · ${inv.department}` : ""}</span>
              </span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusClass[inv.status]}`}>{inv.status}</span>
              <span className="text-xs text-slate-400">{inv.status === "expired" ? "expired" : `expires ${new Date(inv.expires_at).toLocaleDateString()}`}</span>
              <button onClick={() => resend(inv)} title="Send a new link" className="rounded-lg border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-50"><RotateCw size={13} /></button>
              {inv.status === "pending" && (
                <button onClick={() => cancel(inv)} title="Cancel invitation" className="rounded-lg border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-50"><X size={13} /></button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
