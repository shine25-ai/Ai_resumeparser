import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import CareersPage, { type CareersPagePreview } from "../careers/CareersPage";

/**
 * Shown inside the career page builder's preview iframe (/careers/<slug>/preview). The builder sends the
 * unsaved draft with postMessage; only messages from this same site are accepted. Rendering in an iframe makes
 * the phone preview real: the page lays itself out for the iframe's width.
 */
export const PREVIEW_MESSAGE = "career-page-preview";

export default function CareerPagePreviewFrame() {
  const { company } = useParams();
  const [preview, setPreview] = useState<CareersPagePreview | null>(null);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.data?.type !== PREVIEW_MESSAGE) return;
      setPreview(e.data.preview as CareersPagePreview);
    };
    window.addEventListener("message", onMessage);
    // Tell the builder we are ready for the draft.
    window.parent?.postMessage({ type: `${PREVIEW_MESSAGE}-ready` }, window.location.origin);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  if (!preview) return <div className="p-6 text-sm text-slate-500">Loading preview…</div>;
  return <CareersPage company={company} preview={preview} />;
}
