import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Building2, CheckCircle2, Loader2 } from "lucide-react";
import { acceptInvitation, lookupInvitation, type InvitationInfo } from "../utils/adminApi";

/** Public page for an invited user: choose a name and password, then sign in. */
export default function AcceptInvite() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [info, setInfo] = useState<InvitationInfo | null>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("This invitation link is incomplete. Open the link from your email again.");
      return;
    }
    lookupInvitation(token)
      .then((i) => {
        setInfo(i);
        setName(i.full_name || "");
      })
      .catch((e) => setError(e instanceof Error ? e.message : "This invitation link is not valid."));
  }, [token]);

  const mismatch = !!confirm && password !== confirm;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await acceptInvitation(token, name.trim(), password);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not accept the invitation.");
    } finally {
      setSaving(false);
    }
  };

  const input = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none";

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl bg-indigo-50 text-indigo-600">
            {info?.company_logo_url ? <img src={info.company_logo_url} alt="" className="h-full w-full object-contain" /> : <Building2 size={20} />}
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">{info ? `Join ${info.company_name}` : "Accept invitation"}</h1>
            {info && <p className="text-xs text-slate-500">as {info.role.replace(/_/g, " ")}{info.department ? ` · ${info.department}` : ""}</p>}
          </div>
        </div>

        {done ? (
          <div className="space-y-4 text-center">
            <CheckCircle2 size={40} className="mx-auto text-emerald-500" />
            <p className="text-sm text-slate-700">Your account is ready. Sign in with <b>{info?.email}</b> and the password you chose.</p>
            <Link to="/login" className="inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white">Go to sign in</Link>
          </div>
        ) : !info ? (
          error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : (
            <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" /> Checking your invitation…</p>
          )
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <label className="block text-xs font-medium text-slate-600">Email
              <input value={info.email} disabled className={`${input} mt-1 bg-slate-50 text-slate-500`} />
            </label>
            <label className="block text-xs font-medium text-slate-600">Full name
              <input required minLength={2} maxLength={100} value={name} onChange={(e) => setName(e.target.value)} className={`${input} mt-1`} />
            </label>
            <label className="block text-xs font-medium text-slate-600">Password <span className="font-normal text-slate-400">· at least 8 characters</span>
              <input required minLength={8} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={`${input} mt-1`} />
            </label>
            <label className="block text-xs font-medium text-slate-600">Confirm password
              <input required type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={`${input} mt-1 ${mismatch ? "border-rose-400" : ""}`} />
            </label>
            {mismatch && <p className="text-xs text-rose-600">The passwords don't match.</p>}
            {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
            <button disabled={saving || mismatch || password.length < 8 || name.trim().length < 2} className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              {saving && <Loader2 size={14} className="animate-spin" />} Create my account
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
