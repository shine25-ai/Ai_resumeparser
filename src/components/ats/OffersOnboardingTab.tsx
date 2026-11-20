import React, { useState } from 'react';
import {
  FileText,
  CheckCircle2,
  Send,
  Printer,
  Plus,
  X,
  ClipboardCheck,
} from 'lucide-react';
import {
  createOffer,
  updateOfferStatus,
  saveOnboardingChecklist,
  type KanbanCandidate,
  type OfferItem,
  type OnboardingRecord,
} from '../../utils/atsApi';

interface OffersOnboardingTabProps {
  candidates: KanbanCandidate[];
  offers: OfferItem[];
  onboardingList: OnboardingRecord[];
  onReload: () => void;
}

const OFFER_STATUS_STYLE: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-600',
  PENDING_APPROVAL: 'bg-amber-50 text-amber-700 border border-amber-200/80',
  APPROVED: 'bg-indigo-50 text-indigo-700 border border-indigo-200/80',
  SENT: 'bg-sky-50 text-sky-700 border border-sky-200/80',
  ACCEPTED: 'bg-emerald-50 text-emerald-700 border border-emerald-200/80',
  DECLINED: 'bg-rose-50 text-rose-700 border border-rose-200/80',
};

export const OffersOnboardingTab = React.memo(function OffersOnboardingTab({
  candidates,
  offers,
  onboardingList,
  onReload,
}: OffersOnboardingTabProps) {
  const [candId, setCandId] = useState(candidates[0]?.id || '');
  const [role, setRole] = useState(candidates[0]?.role || 'Senior Software Engineer');
  const [department, setDepartment] = useState('Engineering');
  const [ctc, setCtc] = useState('16 LPA');
  const [joiningDate, setJoiningDate] = useState('');
  const [location, setLocation] = useState('Bengaluru / Hybrid');
  const [creating, setCreating] = useState(false);

  const [previewOffer, setPreviewOffer] = useState<OfferItem | null>(null);
  const [localOnboarding, setLocalOnboarding] = useState<OnboardingRecord[]>(onboardingList);

  React.useEffect(() => {
    setLocalOnboarding(onboardingList);
  }, [onboardingList]);

  const handleCreateOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    const cand = candidates.find((c) => c.id === candId);
    if (!cand) return;
    setCreating(true);
    try {
      await createOffer({
        candidate_id: cand.id,
        candidate_name: cand.name,
        candidate_email: cand.email,
        role: role.trim() || cand.role,
        department,
        ctc,
        joining_date: joiningDate || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
        location,
      });
      onReload();
    } finally {
      setCreating(false);
    }
  };

  const handleStatusChange = async (offerId: string, nextStatus: string) => {
    await updateOfferStatus(offerId, nextStatus);
    onReload();
  };

  const handleToggleOnboardingItem = async (record: OnboardingRecord, itemId: string) => {
    const nextItems = record.items.map((i) =>
      i.id === itemId ? { ...i, completed: !i.completed } : i
    );
    const doneCount = nextItems.filter((i) => i.completed).length;
    const progress = Math.round((doneCount / Math.max(nextItems.length, 1)) * 100);
    const joined = nextItems.some((i) => i.id === 'joined_confirmed' && i.completed);

    setLocalOnboarding((prev) =>
      prev.map((r) =>
        r.candidate_id === record.candidate_id
          ? { ...r, items: nextItems, progress_pct: progress, joined }
          : r
      )
    );
    await saveOnboardingChecklist(record.candidate_id, nextItems, joined);
  };

  const printOfferLetter = (offer: OfferItem) => {
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Offer Letter - ${offer.candidate_name}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Inter", sans-serif; color: #0f172a; margin: 48px; line-height: 1.6; font-size: 13px; }
    h1 { font-size: 20px; border-bottom: 2px solid #4f46e5; padding-bottom: 10px; margin-bottom: 24px; }
    .meta { margin-bottom: 24px; color: #475569; }
    .box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0; }
    .row { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #f1f5f9; }
    .sig { margin-top: 48px; display: flex; justify-content: space-between; }
  </style>
</head>
<body>
  <h1>Offer of Employment</h1>
  <div class="meta">Date: ${new Date().toLocaleDateString()}</div>
  <p>Dear <strong>${offer.candidate_name}</strong>,</p>
  <p>We are pleased to offer you the position of <strong>${offer.role}</strong> in our <strong>${offer.department}</strong> team, based in <strong>${offer.location}</strong>.</p>
  <div class="box">
    <div class="row"><span>Position</span><strong>${offer.role}</strong></div>
    <div class="row"><span>Department</span><strong>${offer.department}</strong></div>
    <div class="row"><span>Annual Compensation (CTC)</span><strong>${offer.ctc}</strong></div>
    <div class="row"><span>Tentative Joining Date</span><strong>${offer.joining_date || 'To be mutually agreed'}</strong></div>
    <div class="row"><span>Work Location</span><strong>${offer.location}</strong></div>
  </div>
  <p>This offer is contingent upon successful background verification and submission of standard onboarding documents. Please sign and return this letter to confirm your acceptance.</p>
  <div class="sig">
    <div><strong>Authorized Signatory</strong><br/>Human Resources</div>
    <div><strong>Candidate Acceptance</strong><br/>${offer.candidate_name}</div>
  </div>
</body>
</html>`;
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow?.document;
    if (doc && iframe.contentWindow) {
      doc.open();
      doc.write(html);
      doc.close();
      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => iframe.remove(), 1000);
      }, 120);
    }
  };

  return (
    <div className="space-y-5">
      {/* Row 1: Offer Letter Generator & Approval Workflow */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Create Offer Form */}
        <form
          onSubmit={handleCreateOffer}
          className="lg:col-span-4 bg-white p-5 rounded-xl border border-slate-200/80 space-y-3.5"
        >
          <div className="pb-3 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-900">Generate Offer Letter</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Creates offer for approval &amp; moves candidate to Offer stage
            </p>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">Candidate</label>
            <select
              value={candId}
              onChange={(e) => {
                setCandId(e.target.value);
                const c = candidates.find((x) => x.id === e.target.value);
                if (c) setRole(c.role);
              }}
              className="w-full h-9 px-2.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800"
            >
              {candidates.slice(0, 60).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.stage})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Role Title</label>
              <input
                type="text"
                required
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full h-8.5 px-2.5 bg-white border border-slate-200 rounded-lg text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Department</label>
              <input
                type="text"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full h-8.5 px-2.5 bg-white border border-slate-200 rounded-lg text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Annual CTC</label>
              <input
                type="text"
                required
                value={ctc}
                onChange={(e) => setCtc(e.target.value)}
                placeholder="e.g. 18 LPA"
                className="w-full h-8.5 px-2.5 bg-white border border-slate-200 rounded-lg text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Joining Date
              </label>
              <input
                type="date"
                value={joiningDate}
                onChange={(e) => setJoiningDate(e.target.value)}
                className="w-full h-8.5 px-2.5 bg-white border border-slate-200 rounded-lg text-xs"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">Location</label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full h-8.5 px-2.5 bg-white border border-slate-200 rounded-lg text-xs"
            />
          </div>

          <button
            type="submit"
            disabled={creating || !candId}
            className="w-full h-9 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium inline-flex items-center justify-center gap-1.5 disabled:opacity-60"
          >
            <Plus size={13} />
            <span>{creating ? 'Creating…' : 'Create Offer for Approval'}</span>
          </button>
        </form>

        {/* Offers Approval & Status Table */}
        <div className="lg:col-span-8 bg-white p-5 rounded-xl border border-slate-200/80">
          <div className="pb-3 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Offer Approval &amp; Status Tracking
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Workflow: Pending Approval → Approved → Sent → Accepted / Declined
              </p>
            </div>
            <span className="text-xs font-medium text-slate-500 tabular-nums">
              {offers.length} offers
            </span>
          </div>

          {offers.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {offers.map((o) => (
                <div
                  key={o.id}
                  className="py-3.5 flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold text-slate-900">
                        {o.candidate_name}
                      </span>
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          OFFER_STATUS_STYLE[o.status] || 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {o.status.replace('_', ' ')}
                      </span>
                    </div>
                    <span className="text-xs text-slate-500 block mt-0.5">
                      {o.role} · <strong>{o.ctc}</strong> · Join: {o.joining_date || 'TBD'}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPreviewOffer(o)}
                      className="h-7 px-2.5 rounded-md bg-slate-50 border border-slate-200 hover:bg-slate-100 text-[11px] font-medium text-slate-700 inline-flex items-center gap-1"
                    >
                      <FileText size={11} />
                      Letter
                    </button>
                    {o.status === 'PENDING_APPROVAL' && (
                      <button
                        type="button"
                        onClick={() => handleStatusChange(o.id, 'APPROVED')}
                        className="h-7 px-2.5 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-medium inline-flex items-center gap-1"
                      >
                        <CheckCircle2 size={11} />
                        Approve
                      </button>
                    )}
                    {o.status === 'APPROVED' && (
                      <button
                        type="button"
                        onClick={() => handleStatusChange(o.id, 'SENT')}
                        className="h-7 px-2.5 rounded-md bg-sky-600 hover:bg-sky-700 text-white text-[11px] font-medium inline-flex items-center gap-1"
                      >
                        <Send size={11} />
                        Mark Sent
                      </button>
                    )}
                    {o.status === 'SENT' && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleStatusChange(o.id, 'ACCEPTED')}
                          className="h-7 px-2.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-medium"
                        >
                          Accepted
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStatusChange(o.id, 'DECLINED')}
                          className="h-7 px-2.5 rounded-md bg-white border border-rose-200 text-rose-700 hover:bg-rose-50 text-[11px] font-medium"
                        >
                          Declined
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-10 text-center text-xs text-slate-400">
              No offers generated yet. Create an offer on the left to start the approval workflow.
            </div>
          )}
        </div>
      </div>

      {/* Row 2: Onboarding Checklists for Hired / Offer Candidates */}
      <div className="bg-white p-5 rounded-xl border border-slate-200/80">
        <div className="pb-3 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
              <ClipboardCheck size={15} className="text-emerald-600" />
              <span>Hired &amp; Offer Onboarding Checklists</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Complete pre-joining milestones to finalize the &ldquo;Hired &amp; Joined&rdquo; stage
            </p>
          </div>
          <span className="text-xs font-medium text-slate-500 tabular-nums">
            {localOnboarding.length} active
          </span>
        </div>

        {localOnboarding.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
            {localOnboarding.map((rec) => (
              <div
                key={rec.candidate_id}
                className="p-4 rounded-xl border border-slate-200/80 bg-slate-50/40 space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="text-[13px] font-semibold text-slate-900 block">
                      {rec.candidate_name}
                    </span>
                    <span className="text-xs text-slate-500">{rec.role}</span>
                  </div>
                  <span
                    className={`text-[11px] font-semibold px-2 py-0.5 rounded-full tabular-nums ${
                      rec.joined
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                    }`}
                  >
                    {rec.joined ? 'Joined' : `${rec.progress_pct}% done`}
                  </span>
                </div>

                <div className="w-full bg-slate-200/70 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="h-1.5 rounded-full bg-emerald-500 transition-all duration-300"
                    style={{ width: `${rec.progress_pct}%` }}
                  />
                </div>

                <div className="space-y-1.5">
                  {rec.items.map((item) => (
                    <label
                      key={item.id}
                      className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={item.completed}
                        onChange={() => handleToggleOnboardingItem(rec, item.id)}
                        className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span className={item.completed ? 'line-through text-slate-400' : ''}>
                        {item.label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-10 text-center text-xs text-slate-400">
            Move a candidate to Offer or Hired (or accept an offer above) to track their onboarding checklist.
          </div>
        )}
      </div>

      {/* Offer Letter Preview Modal */}
      {previewOffer && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
        >
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-lg overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-900">
                Offer Letter — {previewOffer.candidate_name}
              </span>
              <button
                type="button"
                onClick={() => setPreviewOffer(null)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X size={15} />
              </button>
            </div>
            <div className="p-5 space-y-3 text-xs text-slate-700 leading-relaxed">
              <p>
                Dear <strong>{previewOffer.candidate_name}</strong>,
              </p>
              <p>
                We are pleased to offer you the position of <strong>{previewOffer.role}</strong> in{' '}
                <strong>{previewOffer.department}</strong> ({previewOffer.location}).
              </p>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/80 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-500">Annual CTC</span>
                  <strong>{previewOffer.ctc}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Joining Date</span>
                  <strong>{previewOffer.joining_date || 'TBD'}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Status</span>
                  <strong>{previewOffer.status.replace('_', ' ')}</strong>
                </div>
              </div>
            </div>
            <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPreviewOffer(null)}
                className="h-8 px-3 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => printOfferLetter(previewOffer)}
                className="h-8 px-3.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium inline-flex items-center gap-1.5"
              >
                <Printer size={12} />
                Print / Save PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

