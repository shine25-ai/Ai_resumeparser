"""
Candidate Data Retention and Deletion Service (Phase 11 - SRS 4.19 / GDPR Compliance).

Applies company `tenant_settings.data_retention_months` (e.g. 6, 12, 24, 36, 60 months; 0 = retain indefinitely).
Targets:
- Candidates whose applications are all in terminal status (REJECTED, WITHDRAWN)
- And whose last activity is older than the retention cutoff.
Supports:
1. Dry-run report (counts and candidate details, non-destructive)
2. Apply mode (deletes/anonymizes candidate records, audited)
3. Staff candidate deletion request flow (on-demand erasure).
"""

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


TERMINAL_APPLICATION_STATUSES = frozenset({
    "REJECTED", "WITHDRAWN", "rejected", "withdrawn", "ARCHIVED", "archived",
})


class RetentionService:
    def __init__(self, db: Any):
        self.db = db

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

        # Calculate cutoff date
        cutoff_date = utc_now() - timedelta(days=retention_months * 30)
        cutoff_iso = cutoff_date.isoformat()

        # Find candidates for this company
        with system_scope():
            candidates = await self.db[CANDIDATES_COLLECTION].find({"company_id": cid}).to_list(length=1000)

        eligible_candidates: List[Dict[str, Any]] = []

        for cand in candidates:
            cand_id = cand.get("id")
            updated_at_str = cand.get("updated_at") or cand.get("created_at") or ""
            try:
                cand_date = datetime.fromisoformat(updated_at_str.replace("Z", "+00:00"))
            except Exception:
                cand_date = utc_now()

            # Must be older than cutoff
            if cand_date > cutoff_date:
                continue

            # Check all applications for this candidate
            with system_scope():
                apps = await self.db[JOB_APPLICATIONS_COLLECTION].find({"candidate_id": cand_id}).to_list(length=50)

            # If candidate has open or active non-terminal applications, skip
            if apps:
                all_terminal = all(
                    (app.get("status") or "").upper() in TERMINAL_APPLICATION_STATUSES or
                    (app.get("stage") or "").upper() in TERMINAL_APPLICATION_STATUSES
                    for app in apps
                )
                if not all_terminal:
                    continue
            else:
                # Candidate without applications check resume status
                if cand.get("status") not in ("rejected", "withdrawn", "archived", "REJECTED", "WITHDRAWN"):
                    continue

            eligible_candidates.append({
                "id": cand_id,
                "name": cand.get("name") or cand.get("full_name") or "Candidate",
                "email": cand.get("email") or "",
                "last_active": updated_at_str,
                "application_count": len(apps),
            })

        count = len(eligible_candidates)

        if not dry_run and count > 0:
            eligible_ids = [c["id"] for c in eligible_candidates]
            with system_scope():
                # Purge candidate records
                await self.db[CANDIDATES_COLLECTION].delete_many({"id": {"$in": eligible_ids}, "company_id": cid})
                await self.db[CANDIDATE_DOCUMENTS_COLLECTION].delete_many({"candidate_id": {"$in": eligible_ids}})
                await self.db[CANDIDATE_SKILLS_COLLECTION].delete_many({"candidate_id": {"$in": eligible_ids}})
                await self.db[JOB_APPLICATIONS_COLLECTION].delete_many({"candidate_id": {"$in": eligible_ids}})
                await self.db[RESUMES_COLLECTION].delete_many({"candidate_id": {"$in": eligible_ids}})

            # Audit retention cleanup
            await record_audit(
                db=self.db,
                actor=actor,
                action="retention.policy_applied",
                entity_type="candidate_retention",
                entity_id=cid,
                entity_label=f"Data retention policy ({retention_months} mo)",
                details=f"Purged {count} rejected/withdrawn candidates past {retention_months} months retention period.",
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
        with system_scope():
            cand = await self.db[CANDIDATES_COLLECTION].find_one({"id": candidate_id, **({"company_id": cid} if cid else {})})
        if not cand:
            raise NotFoundError(f"Candidate '{candidate_id}' not found.")

        cand_name = cand.get("name") or cand.get("full_name") or "Candidate"
        cand_email = cand.get("email") or ""

        with system_scope():
            await self.db[CANDIDATES_COLLECTION].delete_one({"id": candidate_id})
            await self.db[CANDIDATE_DOCUMENTS_COLLECTION].delete_many({"candidate_id": candidate_id})
            await self.db[CANDIDATE_SKILLS_COLLECTION].delete_many({"candidate_id": candidate_id})
            await self.db[JOB_APPLICATIONS_COLLECTION].delete_many({"candidate_id": candidate_id})
            await self.db[RESUMES_COLLECTION].delete_many({"candidate_id": candidate_id})

        await record_audit(
            db=self.db,
            actor=actor,
            action="candidate.erasure_request",
            entity_type="candidate",
            entity_id=candidate_id,
            entity_label=f"{cand_name} ({cand_email})",
            details=f"Staff erasure request processed. Reason: {reason}",
            target_company_id=cid,
        )

        return {
            "success": True,
            "candidate_id": candidate_id,
            "message": f"Candidate '{cand_name}' and all associated documents have been permanently erased.",
        }

