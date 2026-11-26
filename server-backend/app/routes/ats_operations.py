from app.core.dependencies import require_access
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.schemas.common import ApiResponse
from app.core.dependencies import get_current_user
from app.services.ats_operations_service import AtsOperationsService


_PIPELINE_ACCESS = require_access("pipeline", {
    ("POST", "/api/v1/ats/candidates/bulk-action"): "pipeline:edit",
    ("PUT", "/api/v1/ats/candidates/{candidate_id}/tags"): "candidates:edit",
    ("POST", "/api/v1/ats/candidates/{candidate_id}/notes"): "candidates:edit",
    ("GET", "/api/v1/ats/duplicates"): "candidates:view",
    ("POST", "/api/v1/ats/duplicates/merge"): "candidates:edit",
    ("GET", "/api/v1/ats/scorecards"): "evaluations:view",
    ("POST", "/api/v1/ats/scorecards"): "evaluations:create",
    ("POST", "/api/v1/ats/offers"): "pipeline:edit",
    ("PATCH", "/api/v1/ats/offers/{offer_id}/status"): "pipeline:edit",
    ("PUT", "/api/v1/ats/onboarding/{candidate_id}"): "pipeline:edit",
    ("PUT", "/api/v1/ats/automation-templates/{template_id}"): "settings:edit",
    ("POST", "/api/v1/ats/candidates/{candidate_id}/tracking-link"): "pipeline:edit",
    ("GET", "/api/v1/ats/audit-logs"): "audit_logs:view",
})
router = APIRouter(prefix="/api/v1/ats", tags=["ATS Operations"], dependencies=[Depends(_PIPELINE_ACCESS)])
public_track_router = APIRouter(prefix="/api/v1/public", tags=["Public Candidate Tracking"])

_service = AtsOperationsService()


def _actor(current_user: Any) -> str:
    if isinstance(current_user, dict):
        return str(current_user.get("full_name") or current_user.get("email") or "Admin")
    return str(getattr(current_user, "full_name", None) or getattr(current_user, "email", None) or "Admin")


class StageMovePayload(BaseModel):
    stage: str


class BulkActionPayload(BaseModel):
    candidate_ids: List[str]
    action: str  # shortlist | reject | offer


class TagsPayload(BaseModel):
    tags: List[str]


class NotePayload(BaseModel):
    text: str
    mentions: List[str] = []


class DuplicateMergePayload(BaseModel):
    primary_id: str
    secondary_id: str


class ScorecardPayload(BaseModel):
    candidate_id: str
    candidate_name: str
    role: str = ""
    technical: float = 3.0
    communication: float = 3.0
    culture_fit: float = 3.0
    recommendation: str = "Hire"
    notes: str = ""


class OfferCreatePayload(BaseModel):
    candidate_id: str = ""
    candidate_name: str
    candidate_email: str = ""
    role: str
    department: str = "Engineering"
    ctc: str
    joining_date: str = ""
    location: str = "Bengaluru / Hybrid"


class OfferStatusPayload(BaseModel):
    status: str
    note: str = ""


class OnboardingUpdatePayload(BaseModel):
    items: List[Dict[str, Any]]
    joined: bool = False


class AutomationTemplatePayload(BaseModel):
    name: str
    trigger: str = "MANUAL"
    channel: str = "both"
    enabled: bool = True
    subject: str = ""
    email_body: str = ""
    whatsapp_body: str = ""


# ── Kanban & Bulk Actions ─────────────────────────────────────────────────────
@router.get("/kanban", response_model=ApiResponse[Dict[str, Any]])
async def get_kanban(current_user: Any = Depends(get_current_user)):
    data = await _service.get_kanban_board()
    return ApiResponse(success=True, message="Kanban board retrieved", data=data)


@router.patch("/candidates/{candidate_id}/stage", response_model=ApiResponse[Dict[str, Any]])
async def move_stage(
    candidate_id: str,
    payload: StageMovePayload,
    current_user: Any = Depends(get_current_user),
):
    try:
        data = await _service.move_candidate_stage(candidate_id, payload.stage, _actor(current_user))
        return ApiResponse(success=True, message="Candidate stage updated", data=data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/candidates/bulk-action", response_model=ApiResponse[Dict[str, Any]])
async def bulk_action(
    payload: BulkActionPayload,
    current_user: Any = Depends(get_current_user),
):
    try:
        data = await _service.bulk_action(payload.candidate_ids, payload.action, _actor(current_user))
        return ApiResponse(success=True, message="Bulk action applied", data=data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


# ── Tags, Notes & @Mentions ───────────────────────────────────────────────────
@router.get("/candidates/{candidate_id}/collaboration", response_model=ApiResponse[Dict[str, Any]])
async def get_collaboration(candidate_id: str, current_user: Any = Depends(get_current_user)):
    data = await _service.get_collaboration(candidate_id)
    return ApiResponse(success=True, message="Collaboration data retrieved", data=data)


@router.put("/candidates/{candidate_id}/tags", response_model=ApiResponse[Dict[str, Any]])
async def update_tags(
    candidate_id: str,
    payload: TagsPayload,
    current_user: Any = Depends(get_current_user),
):
    data = await _service.update_tags(candidate_id, payload.tags, _actor(current_user))
    return ApiResponse(success=True, message="Tags updated", data=data)


@router.post("/candidates/{candidate_id}/notes", response_model=ApiResponse[Dict[str, Any]])
async def add_note(
    candidate_id: str,
    payload: NotePayload,
    current_user: Any = Depends(get_current_user),
):
    data = await _service.add_note(candidate_id, payload.text, payload.mentions, _actor(current_user))
    return ApiResponse(success=True, message="Note added", data=data)


# ── Duplicate Detection & Merge ───────────────────────────────────────────────
@router.get("/duplicates", response_model=ApiResponse[List[Dict[str, Any]]])
async def get_duplicates(current_user: Any = Depends(get_current_user)):
    data = await _service.get_duplicates()
    return ApiResponse(success=True, message="Duplicate candidates scanned", data=data)


@router.post("/duplicates/merge", response_model=ApiResponse[Dict[str, Any]])
async def merge_duplicates(
    payload: DuplicateMergePayload,
    current_user: Any = Depends(get_current_user),
):
    try:
        data = await _service.merge_duplicates(payload.primary_id, payload.secondary_id, _actor(current_user))
        return ApiResponse(success=True, message="Duplicate profiles merged", data=data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


# ── Interview Scorecards ──────────────────────────────────────────────────────
@router.get("/scorecards", response_model=ApiResponse[List[Dict[str, Any]]])
async def get_scorecards(current_user: Any = Depends(get_current_user)):
    data = await _service.get_scorecards()
    return ApiResponse(success=True, message="Scorecards retrieved", data=data)


@router.post("/scorecards", response_model=ApiResponse[Dict[str, Any]])
async def save_scorecard(
    payload: ScorecardPayload,
    current_user: Any = Depends(get_current_user),
):
    data = await _service.save_scorecard(payload.model_dump(), _actor(current_user), actor_id=(current_user or {}).get("id") if isinstance(current_user, dict) else None)
    return ApiResponse(success=True, message="Scorecard saved", data=data)


# ── Offer Management ──────────────────────────────────────────────────────────
@router.get("/offers", response_model=ApiResponse[List[Dict[str, Any]]])
async def get_offers(current_user: Any = Depends(get_current_user)):
    data = await _service.get_offers()
    return ApiResponse(success=True, message="Offers retrieved", data=data)


@router.post("/offers", response_model=ApiResponse[Dict[str, Any]])
async def create_offer(
    payload: OfferCreatePayload,
    current_user: Any = Depends(get_current_user),
):
    data = await _service.create_offer(payload.model_dump(), _actor(current_user))
    return ApiResponse(success=True, message="Offer created", data=data)


@router.patch("/offers/{offer_id}/status", response_model=ApiResponse[Dict[str, Any]])
async def update_offer_status(
    offer_id: str,
    payload: OfferStatusPayload,
    current_user: Any = Depends(get_current_user),
):
    try:
        data = await _service.update_offer_status(offer_id, payload.status, payload.note, _actor(current_user))
        return ApiResponse(success=True, message="Offer status updated", data=data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


# ── Onboarding Checklist ──────────────────────────────────────────────────────
@router.get("/onboarding", response_model=ApiResponse[List[Dict[str, Any]]])
async def get_onboarding(current_user: Any = Depends(get_current_user)):
    data = await _service.get_onboarding_list()
    return ApiResponse(success=True, message="Onboarding checklists retrieved", data=data)


@router.put("/onboarding/{candidate_id}", response_model=ApiResponse[Dict[str, Any]])
async def update_onboarding(
    candidate_id: str,
    payload: OnboardingUpdatePayload,
    current_user: Any = Depends(get_current_user),
):
    data = await _service.update_onboarding(candidate_id, payload.items, payload.joined, _actor(current_user))
    return ApiResponse(success=True, message="Onboarding checklist saved", data=data)


# ── Email & WhatsApp Automation Templates ─────────────────────────────────────
@router.get("/automation-templates", response_model=ApiResponse[List[Dict[str, Any]]])
async def get_automation_templates(current_user: Any = Depends(get_current_user)):
    data = await _service.get_automation_templates()
    return ApiResponse(success=True, message="Automation templates retrieved", data=data)


@router.put("/automation-templates/{template_id}", response_model=ApiResponse[Dict[str, Any]])
async def save_automation_template(
    template_id: str,
    payload: AutomationTemplatePayload,
    current_user: Any = Depends(get_current_user),
):
    data = await _service.save_automation_template(template_id, payload.model_dump(), _actor(current_user))
    return ApiResponse(success=True, message="Template saved", data=data)


# ── Candidate Self-Service Status Tracking Link ───────────────────────────────
@router.post("/candidates/{candidate_id}/tracking-link", response_model=ApiResponse[Dict[str, Any]])
async def create_tracking_link(candidate_id: str, current_user: Any = Depends(get_current_user)):
    try:
        data = await _service.get_or_create_tracking_token(candidate_id, _actor(current_user))
        return ApiResponse(success=True, message="Tracking link ready", data=data)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@public_track_router.get("/track/{token}", response_model=ApiResponse[Dict[str, Any]])
async def get_public_tracking_status(token: str):
    data = await _service.get_public_tracking_status(token)
    if not data:
        raise HTTPException(status_code=404, detail="Status link is invalid or expired")
    return ApiResponse(success=True, message="Application status retrieved", data=data)


# ── Audit Log Page ────────────────────────────────────────────────────────────
@router.get("/audit-logs", response_model=ApiResponse[Dict[str, Any]])
async def get_audit_logs(
    user: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    current_user: Any = Depends(get_current_user),
):
    data = await _service.get_audit_logs(
        user=user, action=action, start_date=start_date, end_date=end_date, search=search, limit=limit
    )
    return ApiResponse(success=True, message="Audit logs retrieved", data=data)

