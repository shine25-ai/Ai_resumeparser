"""
Phase 8 interview routes: interview panels, scheduling conflict checks, evaluation forms,
interviewer evaluations (draft, submit, admin reopen) and the .ics calendar invite.
"""

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Response, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from app.core.database import get_database
from app.core.dependencies import require_can
from app.repositories.base_repository import BaseRepository
from app.schemas.evaluation import (
    EvaluationFormCreate,
    EvaluationReopenRequest,
    InterviewEvaluationSave,
    InterviewPanelCreate,
)
from app.services.evaluation_service import DEFAULT_TIMEZONE, EvaluationService
from app.services.evaluation_service import stage_suggestion
from app.utils.constants import (
    EVALUATION_FORMS_COLLECTION,
    INTERVIEW_EVALUATIONS_COLLECTION,
    INTERVIEW_PANELS_COLLECTION,
    INTERVIEWS_COLLECTION,
    JOB_OPENINGS_COLLECTION,
)


class PanelConflictCheck(BaseModel):
    interviewer_ids: List[str] = Field(..., min_length=1)
    scheduled_date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    scheduled_time: str = Field(..., pattern=r"^\d{2}:\d{2}$")
    timezone: str = DEFAULT_TIMEZONE
    duration_minutes: int = Field(default=60, ge=5, le=480)
    exclude_interview_id: Optional[str] = None


def get_evaluation_service(db: AsyncIOMotorDatabase = Depends(get_database)) -> EvaluationService:
    return EvaluationService(
        panels=BaseRepository(db, INTERVIEW_PANELS_COLLECTION),
        forms=BaseRepository(db, EVALUATION_FORMS_COLLECTION),
        evaluations=BaseRepository(db, INTERVIEW_EVALUATIONS_COLLECTION),
        interviews=BaseRepository(db, INTERVIEWS_COLLECTION),
    )


panels_router = APIRouter(prefix="/api/v1/interview-panels", tags=["Interview Panels"])


@panels_router.get("", summary="List interview panels", dependencies=[Depends(require_can("interviews:view"))])
async def list_panels(service: EvaluationService = Depends(get_evaluation_service)) -> List[Dict[str, Any]]:
    return await service.list_panels()


@panels_router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    summary="Create an interview panel",
    dependencies=[Depends(require_can("interviews:create"))],
)
async def create_panel(
    payload: InterviewPanelCreate,
    current_user: dict = Depends(require_can("interviews:create")),
    service: EvaluationService = Depends(get_evaluation_service),
) -> Dict[str, Any]:
    return await service.create_panel(payload.model_dump(), current_user)


@panels_router.put(
    "/{panel_id}",
    summary="Update an interview panel",
    dependencies=[Depends(require_can("interviews:edit"))],
)
async def update_panel(
    panel_id: str,
    payload: InterviewPanelCreate,
    service: EvaluationService = Depends(get_evaluation_service),
) -> Dict[str, Any]:
    return await service.update_panel(panel_id, payload.model_dump())


@panels_router.delete(
    "/{panel_id}",
    summary="Delete an interview panel",
    dependencies=[Depends(require_can("interviews:delete"))],
)
async def delete_panel(panel_id: str, service: EvaluationService = Depends(get_evaluation_service)) -> Dict[str, bool]:
    await service.delete_panel(panel_id)
    return {"deleted": True}


@panels_router.post(
    "/check-conflicts",
    summary="Check interviewers for overlapping interviews",
    dependencies=[Depends(require_can("interviews:view"))],
)
async def check_panel_conflicts(
    payload: PanelConflictCheck,
    service: EvaluationService = Depends(get_evaluation_service),
) -> Dict[str, Any]:
    clashes = await service.check_conflicts(
        interviewer_ids=payload.interviewer_ids,
        scheduled_date=payload.scheduled_date,
        scheduled_time=payload.scheduled_time,
        timezone_name=payload.timezone,
        duration_minutes=payload.duration_minutes,
        exclude_interview_id=payload.exclude_interview_id,
    )
    return {"has_conflict": bool(clashes), "conflicts": clashes}


forms_router = APIRouter(prefix="/api/v1/evaluation-forms", tags=["Evaluation Forms"])


@forms_router.get("", summary="List evaluation forms", dependencies=[Depends(require_can("evaluations:view"))])
async def list_forms(service: EvaluationService = Depends(get_evaluation_service)) -> List[Dict[str, Any]]:
    return await service.list_forms()


@forms_router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    summary="Create an evaluation form (company default, per job, or per job and round)",
    dependencies=[Depends(require_can("evaluations:create"))],
)
async def create_form(
    payload: EvaluationFormCreate,
    current_user: dict = Depends(require_can("evaluations:create")),
    service: EvaluationService = Depends(get_evaluation_service),
) -> Dict[str, Any]:
    return await service.create_form(payload.model_dump(), current_user)


interview_eval_router = APIRouter(prefix="/api/v1/interviews", tags=["Interview Evaluations"])


@interview_eval_router.get(
    "/{interview_id}/evaluations",
    summary="Panel view: who has submitted, the score, and the evaluations you may see",
    dependencies=[Depends(require_can("evaluations:view"))],
)
async def get_interview_evaluations(
    interview_id: str,
    current_user: dict = Depends(require_can("evaluations:view")),
    service: EvaluationService = Depends(get_evaluation_service),
) -> Dict[str, Any]:
    return await service.get_panel_view(interview_id, current_user)


@interview_eval_router.put(
    "/{interview_id}/evaluations/me",
    summary="Save your draft evaluation, or submit it (submit=true locks it)",
    dependencies=[Depends(require_can("evaluations:edit"))],
)
async def save_my_evaluation(
    interview_id: str,
    payload: InterviewEvaluationSave,
    current_user: dict = Depends(require_can("evaluations:edit")),
    service: EvaluationService = Depends(get_evaluation_service),
) -> Dict[str, Any]:
    return await service.save_evaluation(interview_id, current_user, payload.model_dump())


@interview_eval_router.post(
    "/{interview_id}/evaluations/{user_id}/reopen",
    summary="Admin: reopen a submitted evaluation (audited)",
    dependencies=[Depends(require_can("evaluations:edit"))],
)
async def reopen_evaluation(
    interview_id: str,
    user_id: str,
    payload: EvaluationReopenRequest,
    current_user: dict = Depends(require_can("evaluations:edit")),
    service: EvaluationService = Depends(get_evaluation_service),
) -> Dict[str, Any]:
    return await service.reopen_evaluation(interview_id, user_id, current_user, payload.reason)


@interview_eval_router.get(
    "/{interview_id}/invite.ics",
    summary="Download the calendar invite (.ics) for an interview",
    dependencies=[Depends(require_can("interviews:view"))],
)
async def download_invite(
    interview_id: str,
    service: EvaluationService = Depends(get_evaluation_service),
) -> Response:
    ics = await service.build_invite_ics(interview_id)
    return Response(
        content=ics,
        media_type="text/calendar; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="interview-{interview_id}.ics"'},
    )


pipeline_router = APIRouter(prefix="/api/v1/pipeline", tags=["Pipeline"])


@pipeline_router.get(
    "/stage-suggestion",
    summary="Suggest the next pipeline stage once every job round is complete (read-only)",
    dependencies=[Depends(require_can("pipeline:view"))],
)
async def get_stage_suggestion(
    candidate_id: str,
    job_id: str,
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> Dict[str, Any]:
    suggestion = await stage_suggestion(
        BaseRepository(db, INTERVIEWS_COLLECTION),
        BaseRepository(db, JOB_OPENINGS_COLLECTION),
        candidate_id,
        job_id,
    )
    return {"suggestion": suggestion}


settings_router = APIRouter(prefix="/api/v1/interview-settings", tags=["Interview Settings"])


@settings_router.get(
    "",
    summary="This company's interview settings (timezone used for new interviews)",
    dependencies=[Depends(require_can("interviews:view"))],
)
async def get_interview_settings(db: AsyncIOMotorDatabase = Depends(get_database)) -> Dict[str, Any]:
    from app.core.tenant import current_company_id
    from app.models.company import DEFAULT_COMPANY_ID
    from app.utils.constants import COMPANIES_COLLECTION

    company_id = current_company_id() or DEFAULT_COMPANY_ID
    company = await db[COMPANIES_COLLECTION].find_one({"id": company_id}) or {}
    return {"timezone": company.get("timezone") or DEFAULT_TIMEZONE}
