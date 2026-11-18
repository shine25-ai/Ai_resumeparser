import React, { useState } from 'react';
import { GitMerge, CheckCircle2, Mail, MessageCircle, Save } from 'lucide-react';
import {
  mergeDuplicateProfiles,
  saveAutomationTemplate,
  type DuplicateGroup,
  type AutomationTemplate,
} from '../../utils/atsApi';

interface DuplicatesTabProps {
  groups: DuplicateGroup[];
  onReload: () => void;
}

export const DuplicatesTab = React.memo(function DuplicatesTab({
  groups,
  onReload,
}: DuplicatesTabProps) {
  const [mergingKey, setMergingKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const handleMerge = async (primaryId: string, secondaryId: string) => {
    const key = `${primaryId}:${secondaryId}`;
    setMergingKey(key);
    setNotice(null);
    try {
      await mergeDuplicateProfiles(primaryId, secondaryId);
      setNotice('Duplicate profile merged successfully. Skills, tags & notes preserved.');
      onReload();
    } catch (err: any) {
      setNotice(err?.message || 'Merge failed.');
    } finally {
      setMergingKey(null);
    }
  };

  return (
    <div className="space-y-4">
      {notice && (
        <div className="px-4 py-2.5 rounded-lg bg-emerald-50 border border-emerald-200/80 text-xs text-emerald-800">
          {notice}
        </div>
      )}

      {groups.length > 0 ? (
        <div className="space-y-4">
          {groups.map((grp) => {
            const primary = grp.candidates[0];
            const duplicates = grp.candidates.slice(1);
            return (
              <div
                key={grp.id}
                className="bg-white p-5 rounded-xl border border-slate-200/80 space-y-3.5"
              >
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">{grp.reason}</h3>
                    <p className="text-xs text-slate-500">
                      {grp.candidates.length} profiles share identical contact identifiers
                    </p>
                  </div>
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200/80">
                    Review &amp; Merge
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {/* Primary */}
                  <div className="p-3.5 rounded-lg bg-indigo-50/40 border border-indigo-200/70 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-indigo-700">
                        Primary Profile (Keep)
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {primary.upload_date?.slice(0, 10)}
                      </span>
                    </div>
                    <div className="text-[13px] font-semibold text-slate-900">{primary.name}</div>
                    <div className="text-xs text-slate-600">{primary.role}</div>
                    <div className="text-[11px] text-slate-500">
                      {primary.email || '—'} · {primary.phone || '—'}
                    </div>
                    <div className="flex flex-wrap gap-1 pt-1">
                      {primary.skills.map((s) => (
                        <span
                          key={s}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-600"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Secondary Candidates */}
                  {duplicates.map((dup) => {
                    const mKey = `${primary.id}:${dup.id}`;
                    return (
                      <div
                        key={dup.id}
                        className="p-3.5 rounded-lg bg-slate-50/70 border border-slate-200/80 flex flex-col justify-between gap-2"
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                              Duplicate Profile
                            </span>
                            <span className="text-[11px] text-slate-400">
                              {dup.upload_date?.slice(0, 10)}
                            </span>
                          </div>
                          <div className="text-[13px] font-semibold text-slate-900">{dup.name}</div>
                          <div className="text-xs text-slate-600">{dup.role}</div>
                          <div className="text-[11px] text-slate-500">
                            {dup.email || '—'} · {dup.phone || '—'}
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={mergingKey === mKey}
                          onClick={() => handleMerge(primary.id, dup.id)}
                          className="h-8 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium inline-flex items-center justify-center gap-1.5 disabled:opacity-60"
                        >
                          <GitMerge size={12} />
                          <span>
                            {mergingKey === mKey ? 'Merging…' : 'Merge into Primary'}
                          </span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white p-12 rounded-xl border border-slate-200/80 text-center space-y-2">
          <CheckCircle2 size={24} className="mx-auto text-emerald-500" />
          <h3 className="text-sm font-semibold text-slate-900">No duplicate profiles detected</h3>
          <p className="text-xs text-slate-500">
            All active candidate profiles have unique email addresses and phone numbers.
          </p>
        </div>
      )}
    </div>
  );
});

interface TemplatesAutomationTabProps {
  templates: AutomationTemplate[];
  onReload: () => void;
}

export const TemplatesAutomationTab = React.memo(function TemplatesAutomationTab({
  templates,
  onReload,
}: TemplatesAutomationTabProps) {
  const [selectedId, setSelectedId] = useState<string>(templates[0]?.id || 'interview_invite');
  const current = templates.find((t) => t.id === selectedId) || templates[0];
  const [draft, setDraft] = useState<AutomationTemplate | null>(current || null);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  React.useEffect(() => {
    const found = templates.find((t) => t.id === selectedId) || templates[0];
    if (found) setDraft({ ...found });
  }, [selectedId, templates]);

  const interpolate = (text: string) =>
    text
      .replace(/\{\{candidate_name\}\}/g, 'Aarav Sharma')
      .replace(/\{\{role\}\}/g, 'Senior Software Engineer')
      .replace(/\{\{company\}\}/g, 'Our Team')
      .replace(/\{\{date\}\}/g, new Date().toLocaleDateString())
      .replace(/\{\{time\}\}/g, '11:30 AM IST')
      .replace(/\{\{meeting_link\}\}/g, 'https://meet.google.com/abc-defg-hij')
      .replace(/\{\{ctc\}\}/g, '18 LPA')
      .replace(/\{\{joining_date\}\}/g, '01 Dec 2026');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    setSaving(true);
    setSavedMsg(null);
    try {
      await saveAutomationTemplate(draft);
      setSavedMsg(`Saved "${draft.name}" template & automation settings.`);
      onReload();
    } finally {
      setSaving(false);
    }
  };

  if (!draft) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      {/* Left Template Selector */}
      <div className="lg:col-span-4 bg-white p-4 rounded-xl border border-slate-200/80 space-y-2">
        <div className="text-xs font-semibold text-slate-900 pb-2 border-b border-slate-100">
          Email &amp; WhatsApp Automations
        </div>
        {templates.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setSelectedId(t.id);
              setSavedMsg(null);
            }}
            className={`w-full p-3 rounded-lg border text-left transition-colors ${
              draft.id === t.id
                ? 'bg-indigo-50/70 border-indigo-200'
                : 'bg-white border-slate-100 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-900">{t.name}</span>
              <span
                className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                  t.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'
                }`}
              >
                {t.enabled ? 'Auto ON' : 'Paused'}
              </span>
            </div>
            <span className="text-[11px] text-slate-400 block mt-0.5">
              Trigger: {t.trigger} · {t.channel}
            </span>
          </button>
        ))}
      </div>

      {/* Right Editor + Live WhatsApp/Email Test */}
      <form
        onSubmit={handleSave}
        className="lg:col-span-8 bg-white p-5 rounded-xl border border-slate-200/80 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">{draft.name}</h3>
            <p className="text-xs text-slate-500">
              Variables: {'{{candidate_name}}'}, {'{{role}}'}, {'{{date}}'}, {'{{time}}'}, {'{{meeting_link}}'}
            </p>
          </div>
          <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600"
            />
            <span>Automation enabled</span>
          </label>
        </div>

        <div>
          <label className="block text-[11px] font-medium text-slate-600 mb-1">Email Subject</label>
          <input
            type="text"
            value={draft.subject}
            onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
            className="w-full h-9 px-3 bg-white border border-slate-200 rounded-lg text-xs"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">Email Body</label>
            <textarea
              rows={6}
              value={draft.email_body}
              onChange={(e) => setDraft({ ...draft, email_body: e.target.value })}
              className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-xs resize-none"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">
              WhatsApp Message
            </label>
            <textarea
              rows={6}
              value={draft.whatsapp_body}
              onChange={(e) => setDraft({ ...draft, whatsapp_body: e.target.value })}
              className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-xs resize-none"
            />
          </div>
        </div>

        {savedMsg && (
          <div className="px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-700">
            {savedMsg}
          </div>
        )}

        <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <a
              href={`mailto:?subject=${encodeURIComponent(interpolate(draft.subject))}&body=${encodeURIComponent(
                interpolate(draft.email_body)
              )}`}
              className="h-8 px-3 rounded-lg bg-slate-50 border border-slate-200 hover:bg-slate-100 text-xs font-medium text-slate-700 inline-flex items-center gap-1.5"
            >
              <Mail size={12} />
              Test Email
            </a>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(interpolate(draft.whatsapp_body))}`}
              target="_blank"
              rel="noopener noreferrer"
              className="h-8 px-3 rounded-lg bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 text-xs font-medium text-emerald-700 inline-flex items-center gap-1.5"
            >
              <MessageCircle size={12} />
              Open WhatsApp
            </a>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="h-8.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-60"
          >
            <Save size={12} />
            <span>{saving ? 'Saving…' : 'Save Template'}</span>
          </button>
        </div>
      </form>
    </div>
  );
});

