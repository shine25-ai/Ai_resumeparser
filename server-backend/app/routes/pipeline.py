"""
Recruitment Pipeline & Kanban Router (SRS 4.11, Screen 14).

Provides endpoints for workflow stage configuration, candidate stage moves
with transition and reason validation, history retrieval, and Kanban board data.
"""

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from app.core.database import get_database
from app.core.dependencies import get_current_active_user, require_access
from app.services.pipeline_service import PipelineService
from app.utils.response import success_response

_ACCESS = require_access(
    "pipeline",
    {
        ("POST", "/api/v1/pipeline/applications/bulk-move"): "pipeline:edit",
        ("POST", "/api/v1/pipeline/workflows"): "pipeline:edit",
        ("DELETE", "/api/v1/pipeline/workflows/{workflow_id}/stages/{stage_id}"): "pipeline:edit",
    },
)
router = APIRouter(prefix="/api/v1/pipeline", tags=["Recruitment Pipeline"], dependencies=[Depends(_ACCESS)])


def get_pipeline_service(db: AsyncIOMotorDatabase = Depends(get_database)) -> PipelineService:
    return PipelineService(db)


class MoveStageBody(BaseModel):
    to_stage_id: str = Field(..., min_length=1, max_length=64)
    reason: Optional[str] = Field(None, max_length=500)
    comment: Optional[str] = Field(None, max_length=1000)


class BulkMoveBody(BaseModel):
    application_ids: List[str] = Field(..., min_length=1)
    to_stage_id: str = Field(..., min_length=1, max_length=64)
    reason: Optional[str] = Field(None, max_length=500)
    comment: Optional[str] = Field(None, max_length=1000)


class WorkflowSaveBody(BaseModel):
    id: Optional[str] = None
    job_id: Optional[str] = None
    name: Optional[str] = "Recruitment Workflow"
    is_default: Optional[bool] = False
    stages: List[Dict[str, Any]] = Field(default_factory=list)


# ── Workflow Configuration ──────────────────────────────────────────────────

@router.get("/workflows", summary="Get active workflow for a job or company default")
async def get_workflow(
    job_id: Optional[str] = Query(None, description="Optional job opening ID for override"),
    service: PipelineService = Depends(get_pipeline_service),
    _user: dict = Depends(get_current_active_user),
):
    workflow = await service.get_workflow(job_id)
    return success_response(data=workflow, message="Workflow retrieved successfully.")


@router.post("/workflows", summary="Create or update workflow configuration")
async def save_workflow(
    body: WorkflowSaveBody,
    user: dict = Depends(get_current_active_user),
    service: PipelineService = Depends(get_pipeline_service),
):
    try:
        saved = await service.save_workflow(user, body.model_dump())
        return success_response(data=saved, message="Workflow saved successfully.")
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.delete("/workflows/{workflow_id}/stages/{stage_id}", summary="Delete a stage from a workflow")
async def delete_stage(
    workflow_id: str,
    stage_id: str,
    reassign_to_stage_id: Optional[str] = Query(None, description="Target stage to move in-use candidates to"),
    user: dict = Depends(get_current_active_user),
    service: PipelineService = Depends(get_pipeline_service),
):
    try:
        result = await service.delete_stage(user, workflow_id, stage_id, reassign_to_stage_id)
        return success_response(data=result, message="Stage deleted successfully.")
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


# ── Kanban Board & Analytics ────────────────────────────────────────────────

@router.get("/kanban", summary="Get full recruitment pipeline Kanban board and analytics")
async def get_kanban_board(
    job_id: Optional[str] = Query(None, description="Filter by job opening ID"),
    recruiter_id: Optional[str] = Query(None, description="Filter by recruiter"),
    source: Optional[str] = Query(None, description="Filter by candidate source"),
    date_from: Optional[str] = Query(None, description="Filter by application date start"),
    date_to: Optional[str] = Query(None, description="Filter by application date end"),
    search: Optional[str] = Query(None, description="Search candidate name or email"),
    sort_by: Optional[str] = Query("applied_date", description="Sort by applied_date, rating, days, name"),
    limit: int = Query(1000, ge=1, le=1000, description="Max applications to load on board"),
    user: dict = Depends(get_current_active_user),
    service: PipelineService = Depends(get_pipeline_service),
):
    board = await service.get_kanban_board(
        user=user,
        job_id=job_id,
        recruiter_id=recruiter_id,
        source=source,
        date_from=date_from,
        date_to=date_to,
        search=search,
        sort_by=sort_by,
        limit=limit,
    )
    return success_response(data=board, message="Kanban board retrieved successfully.")


# ── Candidate Stage Moves ───────────────────────────────────────────────────

@router.patch("/applications/{application_id}/stage", summary="Move candidate application to a new stage")
async def move_stage(
    application_id: str,
    body: MoveStageBody,
    user: dict = Depends(get_current_active_user),
    service: PipelineService = Depends(get_pipeline_service),
):
    try:
        updated = await service.move_candidate_stage(
            user=user,
            application_id=application_id,
            to_stage_id=body.to_stage_id,
            reason=body.reason,
            comment=body.comment,
        )
        return success_response(data=updated, message="Candidate stage moved successfully.")
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.post("/applications/bulk-move", summary="Bulk move multiple candidates to a new stage")
async def bulk_move_stage(
    body: BulkMoveBody,
    user: dict = Depends(get_current_active_user),
    service: PipelineService = Depends(get_pipeline_service),
):
    result = await service.bulk_move_stage(
        user=user,
        application_ids=body.application_ids,
        to_stage_id=body.to_stage_id,
        reason=body.reason,
        comment=body.comment,
    )
    return success_response(data=result, message=f"Moved {result.get('moved_count', 0)} candidates.")


@router.get("/applications/{application_id}/history", summary="Get application stage transition history")
async def get_application_history(
    application_id: str,
    service: PipelineService = Depends(get_pipeline_service),
    _user: dict = Depends(get_current_active_user),
):
    history = await service.get_application_history(application_id)
    return success_response(data=history, message="Application history retrieved successfully.")
