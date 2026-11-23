import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock, ExternalLink, Globe, Loader2, RefreshCw, Share2, Trash2 } from "lucide-react";
import { useFeedback } from "../components/ui/Feedback";
import IntegrationGuide, { type GuideValues } from "../components/careers/IntegrationGuide";
import { BASE_URL } from "../utils/Api";
import {
  fetchCareerDomains,
  fetchCareerIntegration,
  removeCareerCustomDomain,
  setCareerCustomDomain,
  setCareerSubdomain,
  verifyCareerCustomDomain,
  type CareerDomains,
} from "../utils/adminApi";

/** The values the guide fills in for a company. */
const guideValues = (slug: string, companyName: string, careersUrl?: string): GuideValues => {
  const apiBase = new URL(BASE_URL, window.location.href).href.replace(/\/+$/, "");
  return {
    slug,
    companyName,
    careersUrl: careersUrl || `${window.location.origin}/careers/${slug}`,
    apiBase,
    scriptUrl: `${apiBase}/public/career-page/embed.js`,
  };
};

const me = () => {
  try {
    return JSON.parse(localStorage.getItem("user") || "{}");
  } catch {
    return {};
  }
};

function DomainPanel({ domains, onChange }: { domains: CareerDomains; onChange: (d: CareerDomains) => void }) {
  const { toast, confirm } = useFeedback();
  const [value, setValue] = useState(domains.custom_domain);
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (key: string, fn: () => Promise<CareerDomains>, done?: (d: CareerDomains) => string) => {
    setBusy(key);
    try {
      const d = await fn();
      onChange(d);
      if (done) toast(done(d), d.problems?.length ? "error" : "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Something went wrong.", "error");
    } finally {
      setBusy(null);
    }
  };
  const save = (e: FormEvent) => {
    e.preventDefault();
    run("save", () => setCareerCustomDomain(value), () => "Saved. Now add the two DNS records below.");
  };
  const status = domains.custom_status;
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-slate-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-slate-900">Platform subdomain</p>
            <p className="text-xs text-slate-500">
              {domains.subdomain_available ? <code>{domains.subdomain}</code> : "Not set up on this server yet (ask your platform administrator)."}
            </p>
          </div>
          {domains.subdomain_available && (
            <button
              disabled={busy !== null}
              onClick={() => run("sub", () => setCareerSubdomain(!domains.subdomain_enabled), (d) => (d.subdomain_enabled ? `Live at ${d.subdomain}` : "Subdomain turned off."))}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${domains.subdomain_enabled ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-slate-300 bg-white text-slate-700"}`}
            >
              {domains.subdomain_enabled ? "On" : "Turn on"}
            </button>
          )}
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-slate-200 p-4">
        <p className="text-sm font-semibold text-slate-900">Your own domain</p>
        <form onSubmit={save} className="flex gap-2">
          <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="careers.yourcompany.com" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none" />
          <button disabled={!value.trim() || busy !== null} className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">{busy === "save" ? <Loader2 size={14} className="animate-spin" /> : "Save"}</button>
        </form>

        {domains.custom_domain && domains.dns && (
          <>
            <div className="flex items-center gap-2 text-sm">
              {status === "verified" ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700"><CheckCircle2 size={13} /> Verified · live</span>
              ) : status === "failed" ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700"><AlertTriangle size={13} /> Not verified yet</span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700"><Clock size={13} /> Waiting for DNS</span>
              )}
              <span className="text-xs text-slate-500">{domains.custom_domain}</span>
            </div>
            <p className="text-xs text-slate-600">Add these two records at your DNS provider (GoDaddy, Cloudflare, Route 53…), then press Verify. DNS changes can take up to an hour.</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-xs">
                <thead className="text-left text-slate-500"><tr><th className="py-1 pr-3">Type</th><th className="py-1 pr-3">Name / host</th><th className="py-1">Value / points to</th></tr></thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  <tr><td className="py-1.5 pr-3">CNAME</td><td className="py-1.5 pr-3">{domains.dns.cname.name}</td><td className="py-1.5">{domains.dns.cname.value}</td></tr>
                  <tr><td className="py-1.5 pr-3">TXT</td><td className="py-1.5 pr-3">{domains.dns.txt.name}</td><td className="py-1.5 break-all">{domains.dns.txt.value}</td></tr>
                </tbody>
              </table>
            </div>
            {domains.last_check?.problems?.length ? (
              <ul className="list-disc space-y-1 rounded-lg bg-rose-50 py-2 pl-7 pr-3 text-xs text-rose-700">{domains.last_check.problems.map((p) => <li key={p}>{p}</li>)}</ul>
            ) : null}
            <div className="flex gap-2">
              <button disabled={busy !== null} onClick={() => run("verify", verifyCareerCustomDomain, (d) => (d.problems?.length ? "Not verified yet: see the notes above." : "Domain verified."))} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50">
                {busy === "verify" ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Verify
              </button>
              <button
                disabled={busy !== null}
                onClick={async () => {
                  if (await confirm({ title: `Stop using ${domains.custom_domain}?`, confirmLabel: "Remove", danger: true })) {
                    run("remove", removeCareerCustomDomain, () => "Custom domain removed.");
                    setValue("");
                  }
                }}
                className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-rose-600 hover:bg-rose-50"
              >
                <Trash2 size={14} /> Remove
              </button>
            </div>
            <p className="text-[11px] text-slate-400">Once verified, a secure (HTTPS) certificate is issued automatically the first time someone visits.</p>
          </>
        )}
      </div>
    </div>
  );
}

/** Portal screen: Career Page → Add to your website. */
export default function CareerPageIntegrate() {
  const user = me();
  const slug: string = user.company_slug || "";
  const [domains, setDomains] = useState<CareerDomains | null>(null);
  const [seen, setSeen] = useState<{ origin: string; last_seen_at: string } | null>(null);
  const [scriptReady, setScriptReady] = useState(true);
  const [checking, setChecking] = useState(false);

  const check = useCallback(async () => {
    setChecking(true);
    try {
      const s = await fetchCareerIntegration();
      setSeen(s.seen);
      setScriptReady(s.embed_script_available);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    fetchCareerDomains().then(setDomains).catch(() => undefined);
    check();
  }, [check]);

  const liveUrl =
    domains?.custom_status === "verified" ? `https://${domains.custom_domain}` : domains?.subdomain_enabled ? `https://${domains.subdomain}` : undefined;
  const v = guideValues(slug, user.company_name || "", liveUrl);
  const publicGuide = `${window.location.origin}/careers/${slug}/integrate`;

  return (
    <div className="mx-auto max-w-4xl space-y-5 font-sans text-slate-800">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/career-page" className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline"><ArrowLeft size={12} /> Career page</Link>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Add the careers page to your website</h1>
          <p className="text-sm text-slate-500">Pick the way that suits your website. The code below already has your company's details.</p>
        </div>
        <div className="flex gap-2">
          <a href={v.careersUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50"><ExternalLink size={14} /> Open careers page</a>
          <button
            onClick={() => navigator.clipboard?.writeText(publicGuide)}
            title="A page with these steps that you can send to your web agency (no sign-in needed)"
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50"
          >
            <Share2 size={14} /> Copy guide link for your web agency
          </button>
        </div>
      </div>

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <span className={`flex h-9 w-9 items-center justify-center rounded-full ${seen ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-400"}`}><Globe size={18} /></span>
          <div>
            <p className="text-sm font-bold text-slate-900">Test my integration</p>
            <p className="text-xs text-slate-500">
              {seen
                ? <>Connected — seen on <b>{seen.origin}</b> at {new Date(seen.last_seen_at).toLocaleString()}.</>
                : "Not seen on another website yet. Add the embed code, open that page in your browser, then check again."}
            </p>
            {!scriptReady && <p className="mt-1 text-xs text-amber-700">The embed script isn't built on this server yet (npm run build:careers).</p>}
          </div>
        </div>
        <button onClick={check} disabled={checking} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
          {checking ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Check now
        </button>
      </section>

      <IntegrationGuide v={v} domainPanel={domains ? <DomainPanel domains={domains} onChange={setDomains} /> : <p className="text-sm text-slate-500">Loading…</p>} />
    </div>
  );
}

/** Public version (no sign-in): /careers/<company>/integrate, for a company's web agency. */
export function PublicIntegrationGuide() {
  const { company = "" } = useParams();
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-4xl space-y-5 font-sans text-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Add these careers to a website</h1>
          <p className="text-sm text-slate-500">Instructions for <code>{company}</code>. Choose one way; the code is ready to paste.</p>
        </div>
        <IntegrationGuide v={guideValues(company, company)} />
      </div>
    </div>
  );
}
