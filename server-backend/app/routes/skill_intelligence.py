"""
API routes for Skill Intelligence (Phase 9 - SRS 4.16, Screen 13).
"""

import csv
import io
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.database import get_database
from app.core.dependencies import get_current_active_user, require_access
from app.services.skill_intelligence_service import SkillIntelligenceService


class SkillWeightsUpdateRequest(BaseModel):
    interview_weight: float = Field(..., ge=0.0, le=100.0, description="Interview rating weight percentage (e.g. 70.0)")
    resume_weight: float = Field(..., ge=0.0, le=100.0, description="Resume evidence weight percentage (e.g. 30.0)")


class CandidateSkillEditRequest(BaseModel):
    proficiency: float = Field(..., ge=1.0, le=5.0)
    skill_class: Optional[str] = "primary"  # "primary" or "secondary"
    years_experience: Optional[float] = None
    last_used: Optional[str] = None


class MergeSkillRequest(BaseModel):
    source_skill: str
    target_skill: str


_SKILLS_ACCESS = require_access("skills", {
    ("GET", "/api/v1/skills/weights"): "skills:view",
    ("PUT", "/api/v1/skills/weights"): "skills:edit",
    ("GET", "/api/v1/skills/candidate/{candidate_id}"): "skills:view",
    ("POST", "/api/v1/skills/candidate/{candidate_id}/recalculate"): "skills:edit",
    ("PUT", "/api/v1/skills/candidate/{candidate_id}/{skill_name}"): "skills:edit",
    ("GET", "/api/v1/skills/match"): "skills:view",
    ("GET", "/api/v1/skills/matrix"): "skills:view",
    ("GET", "/api/v1/skills/export"): "skills:view",
    ("POST", "/api/v1/skills/merge"): "skills:delete",
})

router = APIRouter(
    prefix="/api/v1/skills",
    tags=["Skill Intelligence"],
    dependencies=[Depends(_SKILLS_ACCESS)],
)


@router.get("/weights", status_code=status.HTTP_200_OK, summary="Get company skill intelligence weights")
async def get_skill_weights(db: AsyncIOMotorDatabase = Depends(get_database)):
    service = SkillIntelligenceService(db)
    return await service.get_company_skill_weights()


@router.put("/weights", status_code=status.HTTP_200_OK, summary="Update company skill weights")
async def update_skill_weights(
    payload: SkillWeightsUpdateRequest,
    current_user: dict = Depends(get_current_active_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    service = SkillIntelligenceService(db)
    return await service.save_company_skill_weights(
        interview_weight=payload.interview_weight,
        resume_weight=payload.resume_weight,
    )


@router.get("/candidate/{candidate_id}", status_code=status.HTTP_200_OK, summary="Get candidate skills")
async def get_candidate_skills(
    candidate_id: str,
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    service = SkillIntelligenceService(db)
    skills = await service.list_candidate_skills(candidate_id)
    if not skills:
        skills = await service.recalculate_candidate_skills(candidate_id)
    return skills


@router.post("/candidate/{candidate_id}/recalculate", status_code=status.HTTP_200_OK, summary="Recalculate candidate skills")
async def recalculate_candidate_skills(
    candidate_id: str,
    current_user: dict = Depends(get_current_active_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    service = SkillIntelligenceService(db)
    return await service.recalculate_candidate_skills(candidate_id)


@router.put("/candidate/{candidate_id}/{skill_name}", status_code=status.HTTP_200_OK, summary="HR edit candidate skill")
async def edit_candidate_skill(
    candidate_id: str,
    skill_name: str,
    payload: CandidateSkillEditRequest,
    current_user: dict = Depends(get_current_active_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    service = SkillIntelligenceService(db)
    return await service.update_candidate_skill_hr(candidate_id, skill_name, payload.model_dump())


@router.get("/match", status_code=status.HTTP_200_OK, summary="Calculate candidate skill match against job")
async def match_candidate_skills(
    candidate_id: str = Query(..., description="Candidate ID"),
    job_id: str = Query(..., description="Job Opening ID"),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    service = SkillIntelligenceService(db)
    return await service.calculate_job_skill_match(candidate_id=candidate_id, job_id=job_id)


@router.get("/matrix", status_code=status.HTTP_200_OK, summary="Get skill matrix analytics & heatmap")
async def get_skill_matrix(
    job_id: Optional[str] = Query(None, description="Optional job ID filter"),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    service = SkillIntelligenceService(db)
    return await service.get_skill_matrix_analytics(job_id=job_id)


@router.get("/export", status_code=status.HTTP_200_OK, summary="Export candidate skill matrix as CSV")
async def export_skill_matrix_csv(
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    service = SkillIntelligenceService(db)
    data = await service.get_skill_matrix_analytics()
    rows = data.get("matrix_rows", [])

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Candidate Name", "Role", "Experience (Years)", "Primary Skills", "All Skills with Proficiency"])

    for r in rows:
        primary_str = ", ".join(r.get("primary_skills", []))
        skills_str = "; ".join(f"{k}: {v}/5" for k, v in (r.get("skills") or {}).items())
        writer.writerow([
            r.get("candidate_name", ""),
            r.get("role", ""),
            r.get("experience", 0),
            primary_str,
            skills_str,
        ])

    return Response(
        content=output.getvalue().encode("utf-8-sig"),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=skill_matrix_export.csv"},
    )


@router.post("/merge", status_code=status.HTTP_200_OK, summary="Admin merge duplicate skills")
async def merge_skills(
    payload: MergeSkillRequest,
    current_user: dict = Depends(get_current_active_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    service = SkillIntelligenceService(db)
    return await service.merge_duplicate_skills(
        source_skill=payload.source_skill,
        target_skill=payload.target_skill,
    )

