"""
Candidate Data Retention and Deletion Service (Phase 11 - SRS 4.19 / GDPR Compliance).

Applies company `tenant_settings.data_retention_months` (e.g. 6, 12, 24, 36, 60 months; 0 = retain indefinitely).
Targets:
- Candidates whose applications all ended REJECTED or WITHDRAWN (no applications: the candidate's own status),
  never archived ones
- And whose last activity is older than the retention cutoff.
Deleting removes the candidate, its documents, skills, applications, resumes (via candidate_ref) and the stored
files (local and S3).
Supports:
1. Dry-run report (counts and candidate details, non-destructive)
2. Apply mode (deletes/anonymizes candidate records, audited)
3. Staff candidate deletion request flow (on-demand erasure).
"""

import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from app.core.exceptions import BadRequestError, NotFoundError
from app.core.tenant import company_scope, current_company_id, system_scope
from app.services.audit_service import record_audit
from app.utils.constants import (
    AUDIT_LOGS_COLLECTION,
    CANDIDATES_COLLECTION,
    CANDIDATE_DOCUMENTS_COLLECTION,
    CANDIDATE_SKILLS_COLLECTION,
    COMPANIES_COLLECTION,
    JOB_APPLICATIONS_COLLECTION,
    RESUMES_COLLECTION,
)
from app.utils.helpers import utc_now


# Only candidates who were turned down or pulled out are deleted under the retention policy. Archived
# candidates are kept: archiving is a filing choice, not a decision that the data may go.
TERMINAL_STATES = frozenset({"REJECTED", "WITHDRAWN"})


def _is_terminal(app: Dict[str, Any]) -> bool:
    """An application is finished when its status, stage or pipeline stage says rejected or withdrawn."""
    return any(str(app.get(k) or "").upper() in TERMINAL_STATES for k in ("status", "stage", "stage_id"))


def _remove_local_file(path: str) -> bool:
    try:
        if path and os.path.isfile(path):
            os.remove(path)
            return True
    except OSError:
        pass
    return False


def _remove_stored_file(url: str) -> bool:
    try:
        from app.services.s3_service import S3Service
        return S3Service().delete_file(url)
    except Exception:
        return False


class RetentionService:
    def __init__(self, db: Any, remove_local=_remove_local_file, remove_stored=_remove_stored_file):
        self.db = db
        self.remove_local = remove_local
        self.remove_stored = remove_stored

    async def _purge(self, cid: str, candidate_ids: List[str]) -> Dict[str, int]:
        """
        Delete these candidates and everything stored about them in company `cid`: candidate records (and
        any merged into them), documents, skills, applications, resumes and the resume files themselves
        (local copies and S3 objects, including extra documents and profile pictures).
        """
        if not candidate_ids:
            return {"candidates": 0, "resumes": 0, "files": 0}
        with system_scope():
            merged = await self.db[CANDIDATES_COLLECTION].find(
                {"company_id": cid, "merged_into": {"$in": candidate_ids}}, {"_id": 0, "id": 1}).to_list(length=None)
            ids = list(dict.fromkeys([*candidate_ids, *(m["id"] for m in merged)]))
            in_company = {"company_id": cid}
            resumes = await self.db[RESUMES_COLLECTION].find(
                {**in_company, "candidate_ref": {"$in": ids}}).to_list(length=None)
            documents = await self.db[CANDIDATE_DOCUMENTS_COLLECTION].find(
                {**in_company, "candidate_id": {"$in": ids}}).to_list(length=None)

            files = 0
            local_paths, urls = set(), set()
            for d in [*resumes, *documents]:
                local_paths.add(d.get("file_path") or "")
                urls.add(d.get("s3_url") or "")
                urls.add(d.get("profile_picture_url") or "")
                for extra in d.get("other_documents") or []:
                    if isinstance(extra, dict):
                        urls.add(extra.get("s3_url") or "")
                        local_paths.add(extra.get("file_path") or "")
            for path in local_paths - {""}:
                files += 1 if self.remove_local(path) else 0
            for url in urls - {""}:
                files += 1 if self.remove_stored(url) else 0

            resume_ids = [r["id"] for r in resumes if r.get("id")]
            await self.db[CANDIDATE_DOCUMENTS_COLLECTION].delete_many({**in_company, "candidate_id": {"$in": ids}})
            await self.db[CANDIDATE_SKILLS_COLLECTION].delete_many({**in_company, "candidate_id": {"$in": ids}})
            await self.db[JOB_APPLICATIONS_COLLECTION].delete_many(
                {**in_company, "$or": [{"candidate_id": {"$in": ids}}, {"resume_id": {"$in": resume_ids}}]})
            await self.db[RESUMES_COLLECTION].delete_many({**in_company, "id": {"$in": resume_ids}})
            result = await self.db[CANDIDATES_COLLECTION].delete_many({**in_company, "id": {"$in": ids}})
        return {"candidates": getattr(result, "deleted_count", len(ids)), "resumes": len(resume_ids), "files": files}

    async def run_retention_job(
        self,
        company_id: Optional[str] = None,
        dry_run: bool = True,
        actor: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Scan candidates for data retention eligibility.
        If dry_run is True, returns preview report without modifying data.
        If dry_run is False, purges eligible candidates and writes audit log entries.
        """
        cid = company_id or current_company_id()
        if not cid:
            raise BadRequestError("Company ID is required to execute retention policy.")

        with system_scope():
            company = await self.db[COMPANIES_COLLECTION].find_one({"id": cid})
        if not company:
            raise NotFoundError(f"Company '{cid}' not found.")

        tenant_settings = company.get("tenant_settings") or {}
        retention_months = int(tenant_settings.get("data_retention_months") or 0)

        # 0 means keep indefinitely
        if retention_months <= 0:
            return {
                "company_id": cid,
                "company_name": company.get("name", ""),
                "retention_months": 0,
                "cutoff_date": None,
                "policy_active": False,
                "eligible_count": 0,
                "candidates": [],
                "dry_run": dry_run,
                "message": "Data retention policy is set to keep data indefinitely (0 months). No candidates purged.",
            }

        cutoff_date = utc_now() - timedelta(days=retention_months * 30)
        cutoff_iso = cutoff_date.isoformat()

        # Every live candidate of this company (no cap; merged records go with the one they were merged into)
        with system_scope():
            candidates = await self.db[CANDIDATES_COLLECTION].find(
                {"company_id": cid, "merged_into": None}).to_list(length=None)

        eligible_candidates: List[Dict[str, Any]] = []
        for cand in candidates:
            cand_id = cand.get("id")
            updated_at_str = cand.get("updated_at") or cand.get("created_at") or ""
            try:
                cand_date = datetime.fromisoformat(updated_at_str.replace("Z", "+00:00"))
                if cand_date.tzinfo is None:
                    cand_date = cand_date.replace(tzinfo=timezone.utc)
            except Exception:
                continue  # no usable date: never delete on a guess
            if cand_date > cutoff_date:
                continue

            with system_scope():
                apps = await self.db[JOB_APPLICATIONS_COLLECTION].find(
                    {"company_id": cid, "candidate_id": cand_id}).to_list(length=None)
            if apps:
                # Every application must have ended in rejected or withdrawn
                if not all(_is_terminal(a) for a in apps):
                    continue
            elif str(cand.get("status") or "").upper() not in TERMINAL_STATES:
                continue

            eligible_candidates.append({
                "id": cand_id,
                "name": cand.get("name") or cand.get("full_name") or "Candidate",
                "email": cand.get("email") or "",
                "last_active": updated_at_str,
                "application_count": len(apps),
            })

        count = len(eligible_candidates)
        purged = {"candidates": 0, "resumes": 0, "files": 0}
        if not dry_run and count > 0:
            purged = await self._purge(cid, [c["id"] for c in eligible_candidates])
            await record_audit(
                db=self.db,
                actor=actor,
                action="retention.policy_applied",
                entity_type="candidate_retention",
                entity_id=cid,
                entity_label=f"Data retention policy ({retention_months} mo)",
                details=(f"Deleted {count} rejected/withdrawn candidates past {retention_months} months: "
                         f"{purged['resumes']} resumes and {purged['files']} stored files removed."),
                target_company_id=cid,
            )

        return {
            "company_id": cid,
            "company_name": company.get("name", ""),
            "retention_months": retention_months,
            "cutoff_date": cutoff_iso,
            "policy_active": True,
            "eligible_count": count,
            "candidates": eligible_candidates,
            "dry_run": dry_run,
            "deleted": purged,
            "message": (
                f"Dry-run report: {count} candidates eligible for deletion."
                if dry_run
                else f"Retention applied: {count} candidates successfully deleted."
            ),
        }

    async def request_candidate_deletion(
        self,
        candidate_id: str,
        reason: str,
        actor: Dict[str, Any],
        company_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Staff-initiated right-to-be-forgotten erasure request for a candidate."""
        cid = company_id or current_company_id()
        if not cid:
            raise BadRequestError("Company ID is required to erase a candidate.")
        with system_scope():
            cand = await self.db[CANDIDATES_COLLECTION].find_one({"id": candidate_id, "company_id": cid})
        if not cand:
            raise NotFoundError(f"Candidate '{candidate_id}' not found.")

        cand_name = cand.get("name") or cand.get("full_name") or "Candidate"
        cand_email = cand.get("email") or ""
        purged = await self._purge(cid, [candidate_id])

        await record_audit(
            db=self.db,
            actor=actor,
            action="candidate.erasure_request",
            entity_type="candidate",
            entity_id=candidate_id,
            entity_label=f"{cand_name} ({cand_email})",
            details=(f"Staff erasure request processed. Reason: {reason}. "
                     f"{purged['resumes']} resumes and {purged['files']} stored files removed."),
            target_company_id=cid,
        )

        return {
            "success": True,
            "candidate_id": candidate_id,
            "deleted": purged,
            "message": f"Candidate '{cand_name}' and all associated documents have been permanently erased.",
        }
