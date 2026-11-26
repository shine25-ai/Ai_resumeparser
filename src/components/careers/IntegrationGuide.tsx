import { useState, type ReactNode } from "react";
import { Check, ChevronDown, Code2, Copy, Globe, Link2, Puzzle } from "lucide-react";

/**
 * "Add the careers page to your website" (plan §4): ready-to-copy code with the company's address filled in,
 * steps for common website builders, options and troubleshooting. Used inside the portal and on the public
 * guide page a company can send to its web agency.
 */

export interface GuideValues {
  slug: string;
  companyName: string;
  careersUrl: string;
  apiBase: string;
  scriptUrl: string;
}

function CopyBlock({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-900">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5">
        <span className="text-[11px] font-medium text-slate-400">{label || "Code"}</span>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(code);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              // Select and copy by hand.
            }
          }}
          className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium text-slate-200 hover:bg-white/10"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 text-[12px] leading-5 text-slate-100"><code>{code}</code></pre>
    </div>
  );
}

function Method({ icon, title, who, children, open = false }: { icon: ReactNode; title: string; who: string; children: ReactNode; open?: boolean }) {
  return (
    <details open={open} className="group rounded-2xl border border-slate-200 bg-white shadow-sm">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">{icon}</span>
        <span className="flex-1">
          <span className="block text-sm font-bold text-slate-900">{title}</span>
          <span className="text-xs text-slate-500">{who}</span>
        </span>
        <ChevronDown size={16} className="text-slate-400 transition group-open:rotate-180" />
      </summary>
      <div className="space-y-3 border-t border-slate-100 px-5 py-4 text-sm text-slate-700">{children}</div>
    </details>
  );
}

export default function IntegrationGuide({ v, domainPanel }: { v: GuideValues; domainPanel?: ReactNode }) {
  const embed = `<div data-careers data-company="${v.slug}" data-api="${v.apiBase}" data-header="false"></div>
<script src="${v.scriptUrl}" defer></script>`;
  const react = `import { useEffect, useRef } from "react";

// Load the script once, e.g. in index.html:
// <script src="${v.scriptUrl}"></script>

export default function Careers() {
  const el = useRef(null);
  useEffect(() => {
    const widget = window.CareersWidget.mount(el.current, {
      company: "${v.slug}",
      apiBaseUrl: "${v.apiBase}",
      showHeader: false, // your site already has a header
    });
    return () => widget.unmount();
  }, []);
  return <div ref={el} />;
}`;
  const link = `<a href="${v.careersUrl}">Careers</a>`;

  return (
    <div className="space-y-4">
      <Method icon={<Link2 size={18} />} title="1. Link to your careers page" who="Any website · no developer needed" open>
        <p>Add a <b>Careers</b> item to your website's menu or footer that opens this address:</p>
        <CopyBlock label="Careers page address" code={v.careersUrl} />
        <CopyBlock label="Or as HTML" code={link} />
        <p className="text-xs text-slate-500">To share one job, open it on the careers page and copy the link (it ends with <code>?job=…</code>).</p>
      </Method>

      <Method icon={<Code2 size={18} />} title="2. Embed the jobs in a page of your site (recommended)" who="Sites where you can paste HTML · WordPress, Wix, Squarespace, Webflow, plain HTML">
        <p>Paste these two lines where the jobs should appear. Candidates search, read and apply without leaving your site.</p>
        <CopyBlock label="Embed code" code={embed} />
        <div className="grid gap-3 md:grid-cols-2">
          {[
            ["WordPress", "Pages → Add New (or edit Careers) → add a “Custom HTML” block → paste the code → Publish."],
            ["Wix", "Add (+) → Embed Code → Embed HTML → paste the code → set the height to “auto” or tall enough."],
            ["Squarespace", "Edit the page → Add block → Code → paste the code → turn off “Display Source”."],
            ["Webflow", "Add panel → Embed → paste the code → Save and publish."],
            ["Plain HTML site", "Open careers.html and paste the code inside <body> where the jobs should show."],
            ["Google Sites", "Insert → Embed → Embed code → paste the code."],
          ].map(([name, steps]) => (
            <div key={name} className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs font-semibold text-slate-900">{name}</p>
              <p className="mt-0.5 text-xs text-slate-600">{steps}</p>
            </div>
          ))}
        </div>
        <p className="text-xs font-semibold text-slate-900">Options</p>
        <table className="w-full text-xs">
          <tbody className="divide-y divide-slate-100">
            {[
              ["data-header=\"false\"", "Hide our header when your site already has one (recommended)."],
              ["data-footer=\"false\"", "Hide our footer."],
              ["data-manage-title=\"true\"", "Let the page set the browser tab title to the open job."],
              ["data-company", `Which company's jobs to show (yours: ${v.slug}).`],
            ].map(([opt, what]) => (
              <tr key={opt}><td className="py-1.5 pr-3 font-mono text-[11px] text-indigo-700">{opt}</td><td className="py-1.5 text-slate-600">{what}</td></tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-slate-500">The embedded page keeps its own styles and doesn't change your site's. Your colours and logo come from Settings → Branding.</p>
      </Method>

      <Method icon={<Puzzle size={18} />} title="3. Add it to a web app (React, Angular, Vue)" who="Developers">
        <p>Load the script once, then mount the jobs into any element. Call <code>unmount()</code> when the page closes.</p>
        <CopyBlock label="React" code={react} />
        <CopyBlock label="Any framework" code={`const widget = window.CareersWidget.mount(document.getElementById("careers"), {\n  company: "${v.slug}",\n  apiBaseUrl: "${v.apiBase}",\n});\n// later: widget.unmount();`} />
      </Method>

      <Method icon={<Globe size={18} />} title="4. Use your own careers address" who="careers.yourcompany.com or a subdomain of ours">
        {domainPanel || (
          <p>
            Your administrator can give the careers page its own address in the portal (Career Page → Add to your website). You'll then add a
            CNAME and a TXT record at your DNS provider; the secure certificate is issued automatically.
          </p>
        )}
      </Method>

      <details className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <summary className="cursor-pointer text-sm font-bold text-slate-900">Troubleshooting</summary>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-700">
          <li><b>Nothing shows.</b> Check <code>data-company="{v.slug}"</code> and that the careers page isn't turned off in Job Openings.</li>
          <li><b>“This careers page was not found.”</b> The company address is wrong, or the careers page is turned off.</li>
          <li>
            <b>Your site blocks outside scripts</b> (Content-Security-Policy). Allow <code>{new URL(v.scriptUrl).origin}</code> in <code>script-src</code> and{" "}
            <code>{new URL(v.apiBase).origin}</code> in <code>connect-src</code> and <code>img-src</code>.
          </li>
          <li><b>The jobs are cut off.</b> Your page builder put the code in a fixed-height box: set its height to auto or make it taller.</li>
          <li><b>Pop-ups appear behind your menu.</b> They shouldn't (they open above everything); tell us which page builder you use.</li>
        </ul>
      </details>
    </div>
  );
}
