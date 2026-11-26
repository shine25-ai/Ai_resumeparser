import asyncio
import re
import secrets
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.core.database import get_database
from app.core.tenant import company_scope, system_scope
from app.models.company import DEFAULT_COMPANY_ID
from app.utils.constants import RESUMES_COLLECTION, INTERVIEWS_COLLECTION, RESUME_LOGS_COLLECTION
from app.utils.hiring_stage import STAGES, stage_of
from app.services.dashboard_service import DashboardService

VALID_STAGES = set(STAGES)

DEFAULT_ONBOARDING_ITEMS = [
    {"id": "offer_signed", "label": "Signed offer letter received", "completed": False},
    {"id": "bgv_cleared", "label": "Background verification (BGV) cleared", "completed": False},
    {"id": "docs_verified", "label": "ID, PAN, Aadhaar & relieving letter collected", "completed": False},
    {"id": "it_provisioned", "label": "Laptop, corporate email & access provisioned", "completed": False},
    {"id": "induction_scheduled", "label": "Day-1 orientation & team induction scheduled", "completed": False},
    {"id": "joined_confirmed", "label": "Candidate joined & marked active in HRIS", "completed": False},
]

DEFAULT_AUTOMATION_TEMPLATES = [
    {
        "id": "interview_invite",
        "name": "Interview Invitation",
        "trigger": "INTERVIEW_SCHEDULED",
        "channel": "both",
        "enabled": True,
        "subject": "Interview Invitation: {{role}} at {{company}}",
        "email_body": (
            "Hi {{candidate_name}},\n\n"
            "We are pleased to invite you for an interview for the {{role}} position.\n"
            "Date: {{date}}\nTime: {{time}}\nMeeting Link: {{meeting_link}}\n\n"
            "Please reply to confirm your availability.\n\nBest regards,\nTalent Acquisition Team"
        ),
        "whatsapp_body": (
            "Hi {{candidate_name}}, your interview for *{{role}}* is scheduled on *{{date}}* at *{{time}}*. "
            "Join link: {{meeting_link}}. Reply YES to confirm."
        ),
    },
    {
        "id": "interview_reminder",
        "name": "Interview 24h Reminder",
        "trigger": "INTERVIEW_REMINDER_24H",
        "channel": "both",
        "enabled": True,
        "subject": "Reminder: Your {{role}} interview is tomorrow at {{time}}",
        "email_body": (
            "Hi {{candidate_name}},\n\n"
            "Friendly reminder about your upcoming {{role}} interview on {{date}} at {{time}}.\n"
            "Join Link: {{meeting_link}}\n\nWishing you the best!\nTalent Acquisition Team"
        ),
        "whatsapp_body": (
            "Reminder: Hi {{candidate_name}}, your *{{role}}* interview is on *{{date}}* at *{{time}}*. "
            "Link: {{meeting_link}}"
        ),
    },
    {
        "id": "rejection",
        "name": "Candidate Rejection",
        "trigger": "STAGE_CLOSED",
        "channel": "email",
        "enabled": False,
        "subject": "Update on your application for {{role}}",
        "email_body": (
            "Hi {{candidate_name}},\n\n"
            "Thank you for taking the time to interview for the {{role}} role. "
            "While we were impressed with your background, we have decided to move forward with other candidates at this time.\n\n"
            "We will keep your profile in our talent pool for future openings.\n\nWarm regards,\nTalent Acquisition Team"
        ),
        "whatsapp_body": (
            "Hi {{candidate_name}}, thank you for applying for {{role}}. We are not moving forward right now, "
            "but will reach out for future matching roles."
        ),
    },
    {
        "id": "offer",
        "name": "Offer Letter Release",
        "trigger": "OFFER_SENT",
        "channel": "both",
        "enabled": True,
        "subject": "Offer of Employment: {{role}} — {{company}}",
        "email_body": (
            "Dear {{candidate_name}},\n\n"
            "Congratulations! We are delighted to extend an official offer for the {{role}} position "
            "with an annual CTC of {{ctc}} and tentative joining date {{joining_date}}.\n\n"
            "Please review and confirm your acceptance.\n\nWelcome aboard!\nHR & Talent Team"
        ),
        "whatsapp_body": (
            "Congratulations {{candidate_name}}! We have emailed your official offer for *{{role}}* ({{ctc}}). "
            "Please review and confirm your acceptance."
        ),
    },
]


def _utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _log_audit(action: str, actor: str, target: str, details: str, metadata: Optional[Dict[str, Any]] = None) -> None:
    db = get_database()
    await db["ats_audit_logs"].insert_one(
        {
            "id": str(uuid.uuid4()),
            "action": action,
            "user": actor or "System",
            "target": target,
            "details": details,
            "metadata": metadata or {},
            "created_at": _utc_iso(),
        }
    )


class AtsOperationsService:
    # ------------------------------------------------------------------
    # 1. Kanban Pipeline Board + Stage Move + Bulk Actions
    # ------------------------------------------------------------------
    async def get_kanban_board(self) -> Dict[str, Any]:
        db = get_database()
        resumes_task = db[RESUMES_COLLECTION].find(
            {"redirect_id": None},
            {
                "_id": 0,
                "id": 1,
                "resume_id": 1,
                "candidate_id": 1,
                "candidate_name": 1,
                "upload_date": 1,
                "created_at": 1,
                "manual_stage": 1,
                "tags": 1,
                "notes": 1,
                "tracking_token": 1,
                "job_title": 1,
                "ai_evaluation.ai_technical_score": 1,
                "original_filename": 1,
                "parsed_data.full_name": 1,
                "parsed_data.name": 1,
                "parsed_data.email": 1,
                "parsed_data.phone": 1,
                "parsed_data.current_role": 1,
                "parsed_data.total_experience_years": 1,
                "parsed_data.primary_skills": 1,
                "parsed_data.location": 1,
            },
        ).sort("upload_date", -1).limit(300).to_list(length=300)

        interviews_task = db[INTERVIEWS_COLLECTION].find(
            {},
            {"_id": 0, "resume_id": 1, "candidate_id": 1, "recommendation": 1, "status": 1, "scheduled_date": 1, "scheduled_time": 1, "created_at": 1},
        ).to_list(length=5000)

        scorecards_task = db["ats_scorecards"].find({}, {"_id": 0}).to_list(length=2000)
        users_task = db["users"].find({}, {"_id": 0, "id": 1, "full_name": 1, "email": 1, "role": 1}).to_list(length=100)

        resumes, interviews, scorecards, users = await asyncio.gather(
            resumes_task, interviews_task, scorecards_task, users_task
        )

        inv_by_cand: Dict[str, List[Dict[str, Any]]] = {}
        for inv in interviews:
            k = str(inv.get("resume_id") or inv.get("candidate_id") or "")
            if k:
                inv_by_cand.setdefault(k, []).append(inv)

        sc_by_cand: Dict[str, List[float]] = {}
        for sc in scorecards:
            cid = str(sc.get("candidate_id") or "")
            if cid and sc.get("overall") is not None:
                sc_by_cand.setdefault(cid, []).append(float(sc["overall"]))

        cards = []
        for r in resumes:
            rid = str(r.get("id") or r.get("resume_id") or "")
            if not rid:
                continue
            pd = r.get("parsed_data") or {}
            manual = r.get("manual_stage")
            if manual in VALID_STAGES:
                stage = manual
            else:
                invs = inv_by_cand.get(rid) or inv_by_cand.get(str(r.get("candidate_id") or "")) or []
                if invs:
                    active = [i for i in invs if str(i.get("status") or "").upper() != "CANCELLED"] or invs
                    latest = max(
                        active,
                        key=lambda i: (str(i.get("scheduled_date") or ""), str(i.get("scheduled_time") or ""), str(i.get("created_at") or "")),
                    )
                    stage = stage_of(latest.get("recommendation"), latest.get("status"))
                else:
                    stage = "Screening"

            sc_list = sc_by_cand.get(rid, [])
            avg_sc = round(sum(sc_list) / len(sc_list), 1) if sc_list else None

            cards.append({
                "id": rid,
                "name": str(pd.get("full_name") or pd.get("name") or r.get("candidate_name") or r.get("original_filename") or "Unnamed Candidate"),
                "email": str(pd.get("email") or ""),
                "phone": str(pd.get("phone") or ""),
                "role": str(pd.get("current_role") or r.get("job_title") or "Candidate"),
                "location": str(pd.get("location") or ""),
                "experience_years": pd.get("total_experience_years"),
                "skills": [str(s) for s in (pd.get("primary_skills") or [])[:5]],
                "ai_score": (r.get("ai_evaluation") or {}).get("ai_technical_score"),
                "stage": stage,
                "tags": list(r.get("tags") or []),
                "notes_count": len(r.get("notes") or []),
                "avg_scorecard": avg_sc,
                "tracking_token": r.get("tracking_token") or "",
                "upload_date": str(r.get("upload_date") or r.get("created_at") or ""),
            })

        team = [
            {"id": str(u.get("id") or u.get("email") or ""), "name": str(u.get("full_name") or u.get("email") or "User"), "email": str(u.get("email") or "")}
            for u in users
        ]
        return {"stages": STAGES, "candidates": cards, "team": team}

    async def move_candidate_stage(self, candidate_id: str, target_stage: str, actor: str) -> Dict[str, Any]:
        if target_stage not in VALID_STAGES:
            raise ValueError(f"Invalid stage '{target_stage}'. Must be one of {sorted(VALID_STAGES)}")
        db = get_database()
        now_iso = _utc_iso()
        from app.core.exceptions import NotFoundError
        result = await db[RESUMES_COLLECTION].update_one(
            {"$or": [{"id": candidate_id}, {"resume_id": candidate_id}, {"candidate_id": candidate_id}]},
            {"$set": {"manual_stage": target_stage, "stage_updated_at": now_iso, "updated_at": now_iso}},
        )
        if result.matched_count == 0:
            # Nothing in this company matches: never report a move that did not happen.
            raise NotFoundError("Candidate not found in this company.")
        await _log_audit(
            "STAGE_MOVED",
            actor,
            candidate_id,
            f"Moved candidate to {target_stage}",
            {"candidate_id": candidate_id, "stage": target_stage},
        )
        DashboardService.invalidate_cache()
        return {"id": candidate_id, "stage": target_stage, "updated_at": now_iso}

    async def bulk_action(self, candidate_ids: List[str], action: str, actor: str) -> Dict[str, Any]:
        if not candidate_ids:
            return {"updated": 0}
        db = get_database()
        now_iso = _utc_iso()
        action_low = action.strip().lower()
        update_op: Dict[str, Any] = {"$set": {"updated_at": now_iso}}

        if action_low == "shortlist":
            update_op["$set"]["manual_stage"] = "Interviewing"
            update_op["$addToSet"] = {"tags": "Shortlisted"}
            audit_act = "BULK_SHORTLIST"
            desc = f"Shortlisted {len(candidate_ids)} candidates to Interviewing"
        elif action_low == "reject":
            update_op["$set"]["manual_stage"] = "Closed"
            update_op["$addToSet"] = {"tags": "Rejected"}
            audit_act = "BULK_REJECT"
            desc = f"Rejected {len(candidate_ids)} candidates to Closed"
        elif action_low == "offer":
            update_op["$set"]["manual_stage"] = "Offer"
            audit_act = "BULK_OFFER"
            desc = f"Moved {len(candidate_ids)} candidates to Offer"
        else:
            raise ValueError("Unsupported bulk action")

        res = await db[RESUMES_COLLECTION].update_many(
            {"$or": [{"id": {"$in": candidate_ids}}, {"resume_id": {"$in": candidate_ids}}]},
            update_op,
        )
        await _log_audit(audit_act, actor, f"{len(candidate_ids)} candidates", desc, {"candidate_ids": candidate_ids[:20]})
        DashboardService.invalidate_cache()
        return {"updated": res.modified_count, "action": action_low}

    # ------------------------------------------------------------------
    # 2. Candidate Tags, Notes & @Mentions
    # ------------------------------------------------------------------
    async def get_collaboration(self, candidate_id: str) -> Dict[str, Any]:
        db = get_database()
        doc = await db[RESUMES_COLLECTION].find_one(
            {"$or": [{"id": candidate_id}, {"resume_id": candidate_id}]},
            {"_id": 0, "id": 1, "tags": 1, "notes": 1, "tracking_token": 1},
        )
        if not doc:
            return {"candidate_id": candidate_id, "tags": [], "notes": [], "tracking_token": ""}
        return {
            "candidate_id": candidate_id,
            "tags": list(doc.get("tags") or []),
            "notes": list(doc.get("notes") or []),
            "tracking_token": doc.get("tracking_token") or "",
        }

    async def update_tags(self, candidate_id: str, tags: List[str], actor: str) -> Dict[str, Any]:
        clean_tags = []
        seen = set()
        for t in tags:
            s = str(t or "").strip()[:30]
            if s and s.lower() not in seen:
                seen.add(s.lower())
                clean_tags.append(s)
        db = get_database()
        await db[RESUMES_COLLECTION].update_one(
            {"$or": [{"id": candidate_id}, {"resume_id": candidate_id}]},
            {"$set": {"tags": clean_tags, "updated_at": _utc_iso()}},
        )
        await _log_audit("TAGS_UPDATED", actor, candidate_id, f"Updated tags: {', '.join(clean_tags) or 'cleared'}")
        return {"candidate_id": candidate_id, "tags": clean_tags}

    async def add_note(self, candidate_id: str, text: str, mentions: List[str], actor: str) -> Dict[str, Any]:
        note = {
            "id": str(uuid.uuid4()),
            "text": text.strip(),
            "mentions": [str(m).strip() for m in mentions if str(m).strip()],
            "author": actor,
            "created_at": _utc_iso(),
        }
        db = get_database()
        await db[RESUMES_COLLECTION].update_one(
            {"$or": [{"id": candidate_id}, {"resume_id": candidate_id}]},
            {"$push": {"notes": {"$each": [note], "$position": 0}}, "$set": {"updated_at": _utc_iso()}},
        )
        await _log_audit("NOTE_ADDED", actor, candidate_id, f"Added note ({len(note['mentions'])} mentions)")
        return note

    # ------------------------------------------------------------------
    # 3. Duplicate Detection & Merge UI
    # ------------------------------------------------------------------
    async def get_duplicates(self) -> List[Dict[str, Any]]:
        db = get_database()
        resumes = await db[RESUMES_COLLECTION].find(
            {"redirect_id": None},
            {
                "_id": 0,
                "id": 1,
                "resume_id": 1,
                "candidate_name": 1,
                "upload_date": 1,
                "email_conflict": 1,
                "parsed_data.full_name": 1,
                "parsed_data.name": 1,
                "parsed_data.email": 1,
                "parsed_data.phone": 1,
                "parsed_data.current_role": 1,
                "parsed_data.total_experience_years": 1,
                "parsed_data.primary_skills": 1,
            },
        ).to_list(length=5000)

        by_email: Dict[str, List[Dict[str, Any]]] = {}
        by_phone: Dict[str, List[Dict[str, Any]]] = {}

        def _fmt(r: Dict[str, Any]) -> Dict[str, Any]:
            pd = r.get("parsed_data") or {}
            return {
                "id": str(r.get("id") or r.get("resume_id") or ""),
                "name": str(pd.get("full_name") or pd.get("name") or r.get("candidate_name") or "Candidate"),
                "email": str(pd.get("email") or ""),
                "phone": str(pd.get("phone") or ""),
                "role": str(pd.get("current_role") or "Candidate"),
                "experience_years": pd.get("total_experience_years"),
                "skills": [str(s) for s in (pd.get("primary_skills") or [])[:6]],
                "upload_date": str(r.get("upload_date") or ""),
            }

        for r in resumes:
            pd = r.get("parsed_data") or {}
            em = str(pd.get("email") or "").strip().lower()
            ph = re.sub(r"\D", "", str(pd.get("phone") or ""))[-10:]
            if em:
                by_email.setdefault(em, []).append(r)
            if len(ph) >= 8:
                by_phone.setdefault(ph, []).append(r)

        groups = []
        seen_pairs = set()

        for key_label, buckets in (("Matching Email", by_email), ("Matching Phone", by_phone)):
            for match_val, docs in buckets.items():
                if len(docs) < 2:
                    continue
                docs_sorted = sorted(docs, key=lambda d: str(d.get("upload_date") or ""), reverse=True)
                ids = tuple(sorted(str(d.get("id") or d.get("resume_id") or "") for d in docs_sorted))
                if ids in seen_pairs:
                    continue
                seen_pairs.add(ids)
                groups.append({
                    "id": f"{key_label.lower().replace(' ', '_')}_{match_val}",
                    "reason": f"{key_label}: {match_val}",
                    "candidates": [_fmt(d) for d in docs_sorted[:4]],
                })

        return groups[:25]

    async def merge_duplicates(self, primary_id: str, secondary_id: str, actor: str) -> Dict[str, Any]:
        if primary_id == secondary_id:
            raise ValueError("Primary and secondary candidate IDs must differ")
        db = get_database()
        primary = await db[RESUMES_COLLECTION].find_one({"$or": [{"id": primary_id}, {"resume_id": primary_id}]})
        secondary = await db[RESUMES_COLLECTION].find_one({"$or": [{"id": secondary_id}, {"resume_id": secondary_id}]})
        if not primary or not secondary:
            raise ValueError("One or both candidate profiles were not found")

        p_skills = list((primary.get("parsed_data") or {}).get("primary_skills") or [])
        s_skills = list((secondary.get("parsed_data") or {}).get("primary_skills") or [])
        merged_skills = list(dict.fromkeys([*p_skills, *s_skills]))

        merged_tags = list(dict.fromkeys([*(primary.get("tags") or []), *(secondary.get("tags") or []), "Merged"]))
        merged_notes = [*(primary.get("notes") or []), *(secondary.get("notes") or [])]

        now_iso = _utc_iso()
        await db[RESUMES_COLLECTION].update_one(
            {"_id": primary["_id"]},
            {
                "$set": {
                    "parsed_data.primary_skills": merged_skills,
                    "tags": merged_tags,
                    "notes": merged_notes,
                    "updated_at": now_iso,
                }
            },
        )
        await db[RESUMES_COLLECTION].update_one(
            {"_id": secondary["_id"]},
            {"$set": {"redirect_id": primary_id, "updated_at": now_iso}},
        )
        await _log_audit(
            "DUPLICATE_MERGED",
            actor,
            primary_id,
            f"Merged duplicate profile {secondary_id} into {primary_id}",
            {"primary_id": primary_id, "secondary_id": secondary_id},
        )
        DashboardService.invalidate_cache()
        return {"primary_id": primary_id, "merged_id": secondary_id, "merged_skills_count": len(merged_skills)}

    # ------------------------------------------------------------------
    # 4. Interview Scorecards & Side-by-Side Comparison
    # ------------------------------------------------------------------
    async def get_scorecards(self) -> List[Dict[str, Any]]:
        db = get_database()
        return await db["ats_scorecards"].find({}, {"_id": 0}).sort("created_at", -1).limit(200).to_list(length=200)

    async def save_scorecard(self, payload: Dict[str, Any], actor: str, actor_id: Optional[str] = None) -> Dict[str, Any]:
        # One system: when exactly one live interview matches this candidate and role, the scorecard becomes
        # that interview's evaluation (same rule as the migration). Otherwise it stays a legacy scorecard.
        from app.core.tenant import current_company_id
        from app.models.company import DEFAULT_COMPANY_ID
        from app.services.scorecard_migration import build_evaluation, plan_matches
        from app.utils.constants import INTERVIEW_EVALUATIONS_COLLECTION, INTERVIEWS_COLLECTION
        from app.utils.helpers import utc_now as _now

        db = get_database()
        candidate_id = str(payload.get("candidate_id") or "")
        role = str(payload.get("role") or "")
        if candidate_id:
            interviews = await db[INTERVIEWS_COLLECTION].find({"candidate_id": candidate_id}).to_list(length=500)
            pseudo = {"id": f"sc-{_now().timestamp()}", "candidate_id": candidate_id, "role": role,
                      "technical": payload.get("technical", 3), "communication": payload.get("communication", 3),
                      "culture_fit": payload.get("culture_fit", 3), "recommendation": payload.get("recommendation") or "",
                      "notes": payload.get("notes") or "", "evaluator": actor, "created_at": _now().isoformat()}
            plan = plan_matches([pseudo], interviews)
            if plan["matched"]:
                _, interview = plan["matched"][0]
                company_id = current_company_id() or DEFAULT_COMPANY_ID
                doc = build_evaluation(pseudo, interview, company_id)
                if actor_id:
                    doc["interviewer_user_id"] = actor_id
                doc["id"] = f"ats-{pseudo['id']}"
                await db[INTERVIEW_EVALUATIONS_COLLECTION].insert_one(doc)
                await _log_audit("SCORECARD_SUBMITTED", actor, candidate_id,
                                 f"Scorecard recorded as evaluation for interview {interview.get('id')}")
                doc.pop("_id", None)
                return {**doc, "stored_as": "evaluation"}

        tech = max(1.0, min(5.0, float(payload.get("technical", 3))))
        comm = max(1.0, min(5.0, float(payload.get("communication", 3))))
        culture = max(1.0, min(5.0, float(payload.get("culture_fit", 3))))
        overall = round((tech + comm + culture) / 3.0, 1)

        doc = {
            "id": str(uuid.uuid4()),
            "candidate_id": str(payload.get("candidate_id") or ""),
            "candidate_name": str(payload.get("candidate_name") or "Candidate"),
            "role": str(payload.get("role") or "Role"),
            "technical": tech,
            "communication": comm,
            "culture_fit": culture,
            "overall": overall,
            "recommendation": str(payload.get("recommendation") or "Hire"),
            "notes": str(payload.get("notes") or "").strip(),
            "evaluator": actor,
            "created_at": _utc_iso(),
        }
        db = get_database()
        await db["ats_scorecards"].insert_one(dict(doc))
        await _log_audit(
            "SCORECARD_SUBMITTED",
            actor,
            doc["candidate_name"],
            f"Scored {overall}/5 ({doc['recommendation']}) for {doc['role']}",
        )
        return doc

    # ------------------------------------------------------------------
    # 5. Offer Management (Letter Generation + Approval Workflow)
    # ------------------------------------------------------------------
    async def get_offers(self) -> List[Dict[str, Any]]:
        db = get_database()
        return await db["ats_offers"].find({}, {"_id": 0}).sort("updated_at", -1).limit(100).to_list(length=100)

    async def create_offer(self, payload: Dict[str, Any], actor: str) -> Dict[str, Any]:
        now_iso = _utc_iso()
        doc = {
            "id": str(uuid.uuid4()),
            "candidate_id": str(payload.get("candidate_id") or ""),
            "candidate_name": str(payload.get("candidate_name") or "Candidate"),
            "candidate_email": str(payload.get("candidate_email") or ""),
            "role": str(payload.get("role") or "Role"),
            "department": str(payload.get("department") or "Engineering"),
            "ctc": str(payload.get("ctc") or "12 LPA"),
            "joining_date": str(payload.get("joining_date") or ""),
            "location": str(payload.get("location") or "Bengaluru / Hybrid"),
            "status": "PENDING_APPROVAL",
            "created_by": actor,
            "approved_by": None,
            "approval_note": "",
            "created_at": now_iso,
            "updated_at": now_iso,
        }
        db = get_database()
        await db["ats_offers"].insert_one(dict(doc))
        if doc["candidate_id"]:
            await db[RESUMES_COLLECTION].update_one(
                {"$or": [{"id": doc["candidate_id"]}, {"resume_id": doc["candidate_id"]}]},
                {"$set": {"manual_stage": "Offer", "updated_at": now_iso}},
            )
        await _log_audit("OFFER_CREATED", actor, doc["candidate_name"], f"Drafted offer for {doc['role']} ({doc['ctc']})")
        DashboardService.invalidate_cache()
        return doc

    async def update_offer_status(self, offer_id: str, new_status: str, note: str, actor: str) -> Dict[str, Any]:
        allowed = {"DRAFT", "PENDING_APPROVAL", "APPROVED", "SENT", "ACCEPTED", "DECLINED"}
        st = new_status.strip().upper()
        if st not in allowed:
            raise ValueError(f"Invalid offer status '{new_status}'")
        db = get_database()
        now_iso = _utc_iso()
        update_fields: Dict[str, Any] = {"status": st, "updated_at": now_iso}
        if note:
            update_fields["approval_note"] = note
        if st == "APPROVED":
            update_fields["approved_by"] = actor

        offer = await db["ats_offers"].find_one({"id": offer_id}, {"_id": 0})
        if not offer:
            raise ValueError("Offer not found")

        await db["ats_offers"].update_one({"id": offer_id}, {"$set": update_fields})
        cid = offer.get("candidate_id")
        if cid:
            if st == "ACCEPTED":
                await db[RESUMES_COLLECTION].update_one(
                    {"$or": [{"id": cid}, {"resume_id": cid}]},
                    {"$set": {"manual_stage": "Hired", "updated_at": now_iso}},
                )
            elif st == "DECLINED":
                await db[RESUMES_COLLECTION].update_one(
                    {"$or": [{"id": cid}, {"resume_id": cid}]},
                    {"$set": {"manual_stage": "Closed", "updated_at": now_iso}},
                )

        await _log_audit("OFFER_STATUS_CHANGED", actor, offer.get("candidate_name", offer_id), f"Offer marked {st}")
        DashboardService.invalidate_cache()
        return {**offer, **update_fields}

    # ------------------------------------------------------------------
    # 6. Onboarding Checklist for Hired Candidates
    # ------------------------------------------------------------------
    async def get_onboarding_list(self) -> List[Dict[str, Any]]:
        db = get_database()
        board = await self.get_kanban_board()
        hired_candidates = [c for c in board["candidates"] if c["stage"] in ("Hired", "Offer")]
        existing_docs = await db["ats_onboarding"].find({}, {"_id": 0}).to_list(length=200)
        by_cid = {str(d.get("candidate_id") or ""): d for d in existing_docs}

        results = []
        for c in hired_candidates:
            cid = c["id"]
            rec = by_cid.get(cid)
            items = rec["items"] if rec and rec.get("items") else [dict(i) for i in DEFAULT_ONBOARDING_ITEMS]
            done = sum(1 for i in items if i.get("completed"))
            results.append({
                "candidate_id": cid,
                "candidate_name": c["name"],
                "role": c["role"],
                "stage": c["stage"],
                "joined": bool(rec.get("joined", False)) if rec else False,
                "progress_pct": round((done / max(len(items), 1)) * 100),
                "items": items,
                "updated_at": rec.get("updated_at") if rec else None,
            })
        return results

    async def update_onboarding(
        self, candidate_id: str, items: List[Dict[str, Any]], joined: bool, actor: str
    ) -> Dict[str, Any]:
        db = get_database()
        now_iso = _utc_iso()
        done = sum(1 for i in items if i.get("completed"))
        doc = {
            "candidate_id": candidate_id,
            "items": items,
            "joined": bool(joined),
            "progress_pct": round((done / max(len(items), 1)) * 100),
            "updated_by": actor,
            "updated_at": now_iso,
        }
        await db["ats_onboarding"].update_one({"candidate_id": candidate_id}, {"$set": doc}, upsert=True)
        if joined:
            await db[RESUMES_COLLECTION].update_one(
                {"$or": [{"id": candidate_id}, {"resume_id": candidate_id}]},
                {"$set": {"manual_stage": "Hired", "updated_at": now_iso}},
            )
            DashboardService.invalidate_cache()
        await _log_audit(
            "ONBOARDING_UPDATED",
            actor,
            candidate_id,
            f"Onboarding progress {doc['progress_pct']}%{' (Joined)' if joined else ''}",
        )
        return doc

    # ------------------------------------------------------------------
    # 7. Email & WhatsApp Templates + Automation Rules
    # ------------------------------------------------------------------
    async def get_automation_templates(self) -> List[Dict[str, Any]]:
        db = get_database()
        docs = await db["ats_automation_templates"].find({}, {"_id": 0}).to_list(length=50)
        if not docs:
            return [dict(t) for t in DEFAULT_AUTOMATION_TEMPLATES]
        by_id = {d["id"]: d for d in docs if d.get("id")}
        merged = []
        for default in DEFAULT_AUTOMATION_TEMPLATES:
            merged.append(by_id.get(default["id"], dict(default)))
        for d in docs:
            if d.get("id") not in {t["id"] for t in DEFAULT_AUTOMATION_TEMPLATES}:
                merged.append(d)
        return merged

    async def save_automation_template(self, template_id: str, payload: Dict[str, Any], actor: str) -> Dict[str, Any]:
        db = get_database()
        now_iso = _utc_iso()
        doc = {
            "id": template_id,
            "name": str(payload.get("name") or template_id),
            "trigger": str(payload.get("trigger") or "MANUAL"),
            "channel": str(payload.get("channel") or "both"),
            "enabled": bool(payload.get("enabled", True)),
            "subject": str(payload.get("subject") or ""),
            "email_body": str(payload.get("email_body") or ""),
            "whatsapp_body": str(payload.get("whatsapp_body") or ""),
            "updated_by": actor,
            "updated_at": now_iso,
        }
        await db["ats_automation_templates"].update_one({"id": template_id}, {"$set": doc}, upsert=True)
        await _log_audit("TEMPLATE_UPDATED", actor, doc["name"], f"Saved {doc['channel']} template ({'Active' if doc['enabled'] else 'Paused'})")
        return doc

    # ------------------------------------------------------------------
    # 8. Candidate Self-Service Status Tracking Link
    # ------------------------------------------------------------------
    async def get_or_create_tracking_token(self, candidate_id: str, actor: str) -> Dict[str, Any]:
        db = get_database()
        doc = await db[RESUMES_COLLECTION].find_one(
            {"$or": [{"id": candidate_id}, {"resume_id": candidate_id}]},
            {"_id": 1, "tracking_token": 1},
        )
        if not doc:
            raise ValueError("Candidate not found")
        token = doc.get("tracking_token")
        if not token:
            token = secrets.token_urlsafe(12)
            await db[RESUMES_COLLECTION].update_one(
                {"_id": doc["_id"]},
                {"$set": {"tracking_token": token, "updated_at": _utc_iso()}},
            )
            await _log_audit("TRACKING_LINK_CREATED", actor, candidate_id, "Generated candidate self-service status link")
        return {"candidate_id": candidate_id, "token": token, "path": f"/track/{token}"}

    async def get_public_tracking_status(self, token: str) -> Optional[Dict[str, Any]]:
        """Public link: the token says which candidate (and so which company); the rest runs in that company."""
        if not token or len(token) < 16:
            return None
        db = get_database()
        with system_scope():
            owner = await db[RESUMES_COLLECTION].find_one({"tracking_token": token}, {"_id": 0, "company_id": 1})
        if not owner:
            return None
        with company_scope(owner.get("company_id") or DEFAULT_COMPANY_ID):
            return await self._public_tracking_status(db, token)

    async def _public_tracking_status(self, db: Any, token: str) -> Optional[Dict[str, Any]]:
        r = await db[RESUMES_COLLECTION].find_one(
            {"tracking_token": token},
            {
                "_id": 0,
                "id": 1,
                "resume_id": 1,
                "candidate_id": 1,
                "candidate_name": 1,
                "job_title": 1,
                "company_name": 1,
                "manual_stage": 1,
                "upload_date": 1,
                "updated_at": 1,
                "parsed_data.name": 1,
                "parsed_data.current_role": 1,
            },
        )
        if not r:
            return None

        rid = str(r.get("id") or r.get("resume_id") or "")
        invs = await db[INTERVIEWS_COLLECTION].find(
            {"$or": [{"resume_id": rid}, {"candidate_id": r.get("candidate_id") or rid}]},
            {"_id": 0, "scheduled_date": 1, "scheduled_time": 1, "status": 1, "recommendation": 1, "job_title": 1, "created_at": 1},
        ).to_list(length=20)

        stage = r.get("manual_stage")
        if stage not in VALID_STAGES:
            if invs:
                active = [i for i in invs if str(i.get("status") or "").upper() != "CANCELLED"] or invs
                latest = max(active, key=lambda i: (str(i.get("scheduled_date") or ""), str(i.get("created_at") or "")))
                stage = stage_of(latest.get("recommendation"), latest.get("status"))
            else:
                stage = "Screening"

        today_str = datetime.now(timezone.utc).date().isoformat()
        upcoming = [
            i for i in invs
            if str(i.get("status") or "").upper() == "SCHEDULED" and str(i.get("scheduled_date") or "") >= today_str
        ]
        upcoming.sort(key=lambda i: (str(i.get("scheduled_date") or ""), str(i.get("scheduled_time") or "")))
        next_inv = upcoming[0] if upcoming else None

        pd = r.get("parsed_data") or {}
        full_name = str(pd.get("name") or r.get("candidate_name") or "Candidate").strip()
        first_name = full_name.split()[0] if full_name else "Candidate"

        return {
            "candidate_first_name": first_name,
            "role": str(r.get("job_title") or (next_inv.get("job_title") if next_inv else None) or pd.get("current_role") or "Open Role"),
            "company": str(r.get("company_name") or "Hiring Team"),
            "current_stage": stage,
            "applied_at": str(r.get("upload_date") or ""),
            "last_updated": str(r.get("updated_at") or r.get("upload_date") or ""),
            "next_interview": (
                {
                    "date": str(next_inv.get("scheduled_date") or ""),
                    "time": str(next_inv.get("scheduled_time") or ""),
                }
                if next_inv
                else None
            ),
        }

    # ------------------------------------------------------------------
    # 9. Audit Log Page (Filterable by User, Action, Date, Search)
    # ------------------------------------------------------------------
    async def get_audit_logs(
        self,
        user: Optional[str] = None,
        action: Optional[str] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        search: Optional[str] = None,
        limit: int = 100,
    ) -> Dict[str, Any]:
        db = get_database()
        ats_logs_task = db["ats_audit_logs"].find({}, {"_id": 0}).sort("created_at", -1).limit(200).to_list(length=200)
        res_logs_task = db[RESUME_LOGS_COLLECTION].find({}, {"_id": 0}).sort("created_at", -1).limit(100).to_list(length=100)
        invs_task = db[INTERVIEWS_COLLECTION].find(
            {},
            {"_id": 0, "id": 1, "candidate_name": 1, "job_title": 1, "status": 1, "created_by": 1, "interviewer_name": 1, "created_at": 1, "updated_at": 1},
        ).sort("created_at", -1).limit(100).to_list(length=100)
        apps_task = db["job_applications"].find(
            {}, {"_id": 0, "applicant_email": 1, "opening_title": 1, "submitted_at": 1}
        ).sort("submitted_at", -1).limit(80).to_list(length=80)

        central_task = db["audit_logs"].find({}, {"_id": 0}).sort("created_at", -1).limit(200).to_list(length=200)

        ats_logs, res_logs, invs, apps, central = await asyncio.gather(
            ats_logs_task, res_logs_task, invs_task, apps_task, central_task
        )

        combined: List[Dict[str, Any]] = []
        for log in central:
            actor_info = log.get("actor") or {}
            changed = ", ".join((log.get("changes") or {}).keys())
            combined.append({
                "id": str(log.get("id") or uuid.uuid4()),
                "action": str(log.get("action") or "EVENT").upper().replace(".", "_"),
                "user": str(actor_info.get("name") or actor_info.get("email") or "System"),
                "target": str(log.get("entity_label") or log.get("entity_id") or log.get("entity_type") or ""),
                "details": str(log.get("details") or (f"Changed: {changed}" if changed else "")),
                "created_at": str(log.get("created_at") or ""),
            })
        for log in ats_logs:
            combined.append({
                "id": str(log.get("id") or uuid.uuid4()),
                "action": str(log.get("action") or "ATS_EVENT"),
                "user": str(log.get("user") or "System"),
                "target": str(log.get("target") or ""),
                "details": str(log.get("details") or ""),
                "created_at": str(log.get("created_at") or ""),
            })
        for log in res_logs:
            combined.append({
                "id": str(log.get("id") or uuid.uuid4()),
                "action": str(log.get("action") or "PROFILE_UPDATED").upper(),
                "user": str(log.get("performed_by") or log.get("email") or "Recruiter"),
                "target": str(log.get("email") or log.get("resume_id") or "Candidate"),
                "details": str(log.get("details") or "Resume profile updated"),
                "created_at": str(log.get("created_at") or ""),
            })
        for inv in invs:
            st = str(inv.get("status") or "SCHEDULED").upper()
            combined.append({
                "id": f"inv-{inv.get('id') or uuid.uuid4()}",
                "action": f"INTERVIEW_{st}",
                "user": str(inv.get("created_by") or inv.get("interviewer_name") or "Recruiter"),
                "target": str(inv.get("candidate_name") or "Candidate"),
                "details": f"{inv.get('job_title') or 'Role'} ({st})",
                "created_at": str(inv.get("updated_at") or inv.get("created_at") or ""),
            })
        for app in apps:
            combined.append({
                "id": f"app-{app.get('applicant_email')}-{app.get('submitted_at')}",
                "action": "APPLICATION_SUBMITTED",
                "user": str(app.get("applicant_email") or "Applicant"),
                "target": str(app.get("opening_title") or "Job Opening"),
                "details": "Applied via careers page",
                "created_at": str(app.get("submitted_at") or ""),
            })

        combined.sort(key=lambda x: x["created_at"], reverse=True)

        available_users = sorted({e["user"] for e in combined if e["user"]})
        available_actions = sorted({e["action"] for e in combined if e["action"]})

        # Apply filters
        u_low = (user or "").strip().lower()
        a_up = (action or "").strip().upper()
        q_low = (search or "").strip().lower()
        sd = (start_date or "").strip()[:10]
        ed = (end_date or "").strip()[:10]

        filtered = []
        for e in combined:
            if u_low and u_low not in e["user"].lower():
                continue
            if a_up and e["action"].upper() != a_up:
                continue
            day = e["created_at"][:10]
            if sd and day and day < sd:
                continue
            if ed and day and day > ed:
                continue
            if q_low and q_low not in f"{e['action']} {e['user']} {e['target']} {e['details']}".lower():
                continue
            filtered.append(e)

        return {
            "logs": filtered[:limit],
            "total": len(filtered),
            "users": available_users,
            "actions": available_actions,
        }

