import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { ROLES_URL, apiFetch } from "../utils/Api";

/** Modules × actions grid for a role's permissions ("module:action"), SRS Screen 19. */

export interface MatrixModule {
  id: string;
  label: string;
  actions: string[];
}

export interface DefaultRole {
  slug: string;
  name: string;
  description: string;
  permissions: string[];
}

export interface PermissionMatrixData {
  modules: MatrixModule[];
  action_labels: Record<string, string>;
  default_roles: DefaultRole[];
}

let cached: PermissionMatrixData | null = null;

export async function fetchPermissionMatrix(): Promise<PermissionMatrixData> {
  if (cached) return cached;
  const res = await apiFetch(`${ROLES_URL}/permission-matrix`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.message || body?.detail || "Could not load permissions.");
  cached = body.data as PermissionMatrixData;
  return cached;
}

export function usePermissionMatrix() {
  const [data, setData] = useState<PermissionMatrixData | null>(cached);
  const [error, setError] = useState("");
  useEffect(() => {
    if (cached) return;
    fetchPermissionMatrix().then(setData).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  return { data, error };
}

const ALL_ACTIONS = ["view", "create", "edit", "delete", "publish", "approve", "export"];

export default function PermissionMatrix({
  value,
  onChange,
  readOnly = false,
}: {
  value: string[];
  onChange?: (next: string[]) => void;
  readOnly?: boolean;
}) {
  const { data, error } = usePermissionMatrix();
  if (error) return <p className="text-xs text-rose-600">{error}</p>;
  if (!data) {
    return (
      <p className="flex items-center gap-2 text-xs text-slate-500">
        <Loader2 size={14} className="animate-spin" /> Loading permissions…
      </p>
    );
  }

  const has = new Set(value);
  const actions = ALL_ACTIONS.filter((a) => data.modules.some((m) => m.actions.includes(a)));
  const set = (perms: string[], on: boolean) => {
    if (readOnly || !onChange) return;
    const next = new Set(value);
    perms.forEach((p) => (on ? next.add(p) : next.delete(p)));
    // Any other action needs "view" of the same module.
    perms.forEach((p) => {
      const [m, a] = p.split(":");
      if (on && a !== "view") next.add(`${m}:view`);
      if (!on && a === "view") data.modules.find((x) => x.id === m)?.actions.forEach((x) => next.delete(`${m}:${x}`));
    });
    onChange([...next].sort());
  };
  const total = data.modules.reduce((n, m) => n + m.actions.length, 0);
  const allOn = value.filter((p) => p.includes(":")).length >= total;

  return (
    <div className="space-y-2">
      {!readOnly && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => set(data.modules.flatMap((m) => m.actions.map((a) => `${m.id}:${a}`)), !allOn)}
            className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
          >
            {allOn ? "Clear all" : "Allow everything"}
          </button>
        </div>
      )}
      <div className="max-h-80 overflow-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[560px] text-xs">
          <thead className="sticky top-0 bg-slate-50 text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Module</th>
              {actions.map((a) => (
                <th key={a} className="px-2 py-2 text-center font-semibold">{data.action_labels[a] || a}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.modules.map((m) => {
              const rowPerms = m.actions.map((a) => `${m.id}:${a}`);
              const rowOn = rowPerms.every((p) => has.has(p));
              return (
                <tr key={m.id} className="hover:bg-slate-50/60">
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      disabled={readOnly}
                      onClick={() => set(rowPerms, !rowOn)}
                      className="text-left font-medium text-slate-800 disabled:cursor-default"
                      title={readOnly ? undefined : rowOn ? "Clear this module" : "Allow everything in this module"}
                    >
                      {m.label}
                    </button>
                  </td>
                  {actions.map((a) => (
                    <td key={a} className="px-2 py-2 text-center">
                      {m.actions.includes(a) ? (
                        <input
                          type="checkbox"
                          aria-label={`${m.label}: ${data.action_labels[a] || a}`}
                          checked={has.has(`${m.id}:${a}`)}
                          disabled={readOnly}
                          onChange={(e) => set([`${m.id}:${a}`], e.target.checked)}
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-60"
                        />
                      ) : (
                        <span className="text-slate-200">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Short summary for role lists: "Jobs (4), Candidates (5) …" */
export function summarizePermissions(perms: string[], modules: MatrixModule[] | undefined): { label: string; count: number; full: boolean }[] {
  if (!modules) return [];
  return modules
    .map((m) => {
      const count = m.actions.filter((a) => perms.includes(`${m.id}:${a}`)).length;
      return { label: m.label, count, full: count === m.actions.length };
    })
    .filter((x) => x.count > 0);
}
