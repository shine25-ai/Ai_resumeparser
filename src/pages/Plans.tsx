import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Check, CreditCard, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { useFeedback } from "../components/ui/Feedback";
import { createPlan, deletePlan, fetchPlans, updatePlan, type Plan, type PlanChanges } from "../utils/adminApi";
import { EMPTY_LIMITS, Field, inputClass, limitText, planPrice } from "../components/companies/companyForm";

/**
 * Super admin: Plans & Billing (SRS Screen 22, "Subscription Plans & Billing"). The plan catalogue companies are
 * put on. Choosing a plan for a company copies its limits. Prices are shown only: online payments come later.
 */

interface Draft {
  name: string;
  description: string;
  monthly_price: string;
  currency: string;
  features: string;
  users: number;
  active_jobs: number;
  storage_mb: number;
  ai_parses_per_month: number;
  is_active: boolean;
  sort_order: number;
}

const toDraft = (p?: Plan): Draft => ({
  name: p?.name ?? "",
  description: p?.description ?? "",
  monthly_price: p?.monthly_price == null ? "" : String(p.monthly_price),
  currency: p?.currency ?? "INR",
  features: (p?.features ?? []).join("\n"),
  ...EMPTY_LIMITS,
  ...(p?.limits || {}),
  is_active: p?.is_active ?? true,
  sort_order: p?.sort_order ?? 0,
});

const toChanges = (d: Draft): PlanChanges & { name: string } => ({
  name: d.name.trim(),
  description: d.description.trim(),
  monthly_price: d.monthly_price.trim() === "" ? null : Number(d.monthly_price),
  currency: d.currency,
  features: d.features.split("\n").map((f) => f.trim()).filter(Boolean),
  limits: { users: d.users, active_jobs: d.active_jobs, storage_mb: d.storage_mb, ai_parses_per_month: d.ai_parses_per_month },
  is_active: d.is_active,
  sort_order: d.sort_order,
});

function PlanForm({ plan, onClose, onSaved }: { plan?: Plan; onClose: () => void; onSaved: () => void }) {
  const { toast } = useFeedback();
  const [d, setD] = useState<Draft>(toDraft(plan));
  const [saving, setSaving] = useState(false);
  const num = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement>) => setD({ ...d, [k]: Math.max(0, parseInt(e.target.value || "0", 10) || 0) });

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (plan) await updatePlan(plan.id, toChanges(d));
      else await createPlan(toChanges(d));
      toast(plan ? "Plan saved. Companies already on it keep their limits until you change them." : "Plan added.", "success");
      onSaved();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not save the plan.", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:p-10">
      <form onSubmit={save} className="w-full max-w-2xl space-y-4 rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">{plan ? `Edit ${plan.name}` : "Add plan"}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Plan name" required className="sm:col-span-2"><input required autoFocus maxLength={60} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="Growth" className={inputClass} /></Field>
          <Field label="Order" hint="smaller first"><input type="number" min={0} value={d.sort_order} onChange={num("sort_order")} className={inputClass} /></Field>
          <Field label="Monthly price" hint="empty = custom price">
            <input type="number" min={0} step="0.01" value={d.monthly_price} onChange={(e) => setD({ ...d, monthly_price: e.target.value })} placeholder="Custom" className={inputClass} />
          </Field>
          <Field label="Currency">
            <select value={d.currency} onChange={(e) => setD({ ...d, currency: e.target.value })} className={inputClass}>
              {["INR", "USD", "EUR", "GBP", "AED", "SGD"].map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700">
            <input type="checkbox" checked={d.is_active} onChange={(e) => setD({ ...d, is_active: e.target.checked })} /> Offered to new companies
          </label>
          <Field label="Short description" className="sm:col-span-3"><input maxLength={300} value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} className={inputClass} /></Field>
          <Field label="Key features" hint="one per line" className="sm:col-span-3">
            <textarea rows={4} value={d.features} onChange={(e) => setD({ ...d, features: e.target.value })} placeholder={"Up to 25 jobs\nAI resume parsing\nReports"} className={inputClass} />
          </Field>
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold text-slate-700">Limits <span className="font-normal text-slate-400">· 0 = no limit</span></p>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Users"><input type="number" min={0} value={d.users} onChange={num("users")} className={inputClass} /></Field>
            <Field label="Active jobs"><input type="number" min={0} value={d.active_jobs} onChange={num("active_jobs")} className={inputClass} /></Field>
            <Field label="Storage (MB)"><input type="number" min={0} value={d.storage_mb} onChange={num("storage_mb")} className={inputClass} /></Field>
            <Field label="AI parses / month"><input type="number" min={0} value={d.ai_parses_per_month} onChange={num("ai_parses_per_month")} className={inputClass} /></Field>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">Cancel</button>
          <button disabled={saving || !d.name.trim()} className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} {plan ? "Save" : "Add plan"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function Plans() {
  const { toast, confirm } = useFeedback();
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [editing, setEditing] = useState<Plan | "new" | null>(null);

  const load = useCallback(() => {
    fetchPlans().then(setPlans).catch((e) => {
      toast(e instanceof Error ? e.message : "Could not load plans.", "error");
      setPlans([]);
    });
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (p: Plan) => {
    if (!(await confirm({ title: `Delete ${p.name}?`, message: "Only plans no company uses can be deleted.", confirmLabel: "Delete", danger: true }))) return;
    try {
      await deletePlan(p.id);
      toast("Plan deleted.", "success");
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not delete the plan.", "error");
    }
  };

  return (
    <div className="space-y-5 font-sans text-slate-800">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Plans & Billing</h1>
          <p className="text-sm text-slate-500">The plans companies can be on. Choosing a plan for a company copies its limits. Online payments come later.</p>
        </div>
        <button onClick={() => setEditing("new")} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
          <Plus size={16} /> Add Plan
        </button>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3">
          <CreditCard size={18} className="text-indigo-600" />
          <h2 className="font-bold text-slate-900">Subscription Plans</h2>
        </div>
        {plans === null ? (
          <p className="flex items-center gap-2 p-6 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" /> Loading…</p>
        ) : plans.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            <p>No plans yet.</p>
            <button onClick={() => setEditing("new")} className="mt-2 font-semibold text-indigo-600 hover:underline">Add your first plan</button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-600">
                <tr>
                  <th className="px-5 py-3">Plan Name</th>
                  <th className="px-5 py-3">Monthly Price</th>
                  <th className="px-5 py-3">Key Features</th>
                  <th className="px-5 py-3">Limits</th>
                  <th className="px-5 py-3 text-right">Companies</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {plans.map((p) => (
                  <tr key={p.id}>
                    <td className="px-5 py-3"><p className="font-semibold text-slate-900">{p.name}</p><p className="text-xs text-slate-400">{p.code}</p></td>
                    <td className="px-5 py-3 font-medium">{planPrice(p)}</td>
                    <td className="px-5 py-3 text-slate-600">{p.features.join(", ") || "—"}</td>
                    <td className="px-5 py-3 text-xs text-slate-600">{limitText(p.limits.users)} users · {limitText(p.limits.active_jobs)} jobs</td>
                    <td className="px-5 py-3 text-right tabular-nums">{p.companies_count}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${p.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                        {p.is_active ? "Active" : "Off"}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => setEditing(p)} title="Edit" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><Pencil size={15} /></button>
                        <button onClick={() => remove(p)} disabled={p.companies_count > 0} title={p.companies_count ? "Companies are on this plan" : "Delete"} className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50 disabled:opacity-30"><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editing && <PlanForm plan={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}
