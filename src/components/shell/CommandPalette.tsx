import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Briefcase, Building2, CornerDownLeft, FileText, Search, Users } from "lucide-react";
import { fetchAllCompanies, fetchJobOpenings } from "../../utils/jobsApi";
import { allowed, isPlatformMode, menuFor, type NavUser } from "./navigation";

interface Result {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  go: () => void;
}

const readUser = (): NavUser | null => {
  try {
    return JSON.parse(localStorage.getItem("user") || "null");
  } catch {
    return null;
  }
};

/** Ctrl+K / ⌘K: jump to a page, a job, a company, or search candidates. */
export default function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [index, setIndex] = useState(0);
  const [jobs, setJobs] = useState<{ id: string; title: string; code: string }[]>([]);
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const user = useMemo(readUser, [open]);
  const platform = isPlatformMode(user);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setIndex(0);
    setTimeout(() => inputRef.current?.focus(), 0);
    if (platform) {
      fetchAllCompanies().then((c) => setCompanies(c.map(({ id, name }) => ({ id, name })))).catch(() => undefined);
    } else if (allowed(user, "upload")) {
      fetchJobOpenings().then((j) => setJobs(j.map(({ id, title, code }) => ({ id, title, code })))).catch(() => undefined);
    }
  }, [open, platform, user]);

  const results = useMemo<Result[]>(() => {
    const term = q.trim().toLowerCase();
    const hit = (s: string) => !term || s.toLowerCase().includes(term);
    const go = (path: string) => () => {
      onClose();
      navigate(path);
    };
    const pages: Result[] = [];
    for (const item of menuFor(user)) {
      if (hit(item.label)) pages.push({ id: `p:${item.path}`, group: "Pages", label: item.label, icon: <FileText size={15} />, go: go(item.path) });
      for (const c of item.children || []) {
        if (c.label !== item.label && (hit(c.label) || (term && hit(item.label)))) {
          pages.push({ id: `p:${c.path}`, group: "Pages", label: c.label, hint: item.label, icon: <FileText size={15} />, go: go(c.path) });
        }
      }
    }
    const out = pages.slice(0, term ? 8 : 6);
    if (term) {
      for (const j of jobs.filter((j) => hit(j.title) || hit(j.code)).slice(0, 5)) {
        out.push({ id: `j:${j.id}`, group: "Jobs", label: j.title, hint: j.code, icon: <Briefcase size={15} />, go: go(`/job-openings?jobId=${j.id}`) });
      }
      for (const c of companies.filter((c) => hit(c.name)).slice(0, 5)) {
        out.push({ id: `c:${c.id}`, group: "Companies", label: c.name, icon: <Building2 size={15} />, go: go(`/companies?company=${c.id}`) });
      }
      if (!platform && allowed(user, "database")) {
        out.push({ id: "cand", group: "Candidates", label: `Search candidates for “${q.trim()}”`, icon: <Users size={15} />, go: go(`/database?search=${encodeURIComponent(q.trim())}`) });
      }
    }
    return out;
  }, [q, jobs, companies, user, platform, navigate, onClose]);

  useEffect(() => setIndex(0), [q]);

  if (!open) return null;

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      results[index]?.go();
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  let lastGroup = "";
  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-slate-900/40 px-4 pt-[12vh]" onMouseDown={onClose}>
      <div role="dialog" aria-label="Search" className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <label className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
          <Search size={18} className="text-slate-400" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder={platform ? "Search pages and companies…" : "Search pages, jobs and candidates…"}
            className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
          />
          <kbd className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-400">Esc</kbd>
        </label>
        <div className="max-h-[50vh] overflow-y-auto py-1">
          {results.length === 0 && <p className="px-4 py-6 text-center text-sm text-slate-400">Nothing found.</p>}
          {results.map((r, i) => {
            const header = r.group !== lastGroup ? r.group : "";
            lastGroup = r.group;
            return (
              <div key={r.id}>
                {header && <p className="px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{header}</p>}
                <button
                  type="button"
                  onMouseEnter={() => setIndex(i)}
                  onClick={r.go}
                  className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm ${i === index ? "bg-indigo-50 text-indigo-700" : "text-slate-700"}`}
                >
                  <span className="text-slate-400">{r.icon}</span>
                  <span className="flex-1 truncate">{r.label}</span>
                  {r.hint && <span className="text-xs text-slate-400">{r.hint}</span>}
                  {i === index && <CornerDownLeft size={13} className="text-indigo-400" />}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
