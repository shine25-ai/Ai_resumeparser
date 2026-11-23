"""
Subscription plan catalogue (super admin). See app.services.plan_service.
"""

from typing import Any, Dict

from fastapi import APIRouter, Depends, Query, Request, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.database import get_database
from app.core.dependencies import require_superadmin
from app.services.audit_service import record_audit
from app.services.plan_service import PlanService
from app.utils.response import success_response

router = APIRouter(prefix="/api/v1/platform/plans", tags=["Platform settings"])


def get_service(db: AsyncIOMotorDatabase = Depends(get_database)) -> PlanService:
    return PlanService(db)


@router.get("", summary="Subscription plans, with how many companies use each")
async def list_plans(
    include_inactive: bool = Query(True),
    _user: dict = Depends(require_superadmin),
    service: PlanService = Depends(get_service),
):
    return success_response(data=await service.list(include_inactive), message="Plans retrieved.")


@router.post("", status_code=status.HTTP_201_CREATED, summary="Add a plan")
async def create_plan(
    body: Dict[str, Any],
    request: Request,
    user: dict = Depends(require_superadmin),
    service: PlanService = Depends(get_service),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    plan = await service.create(body)
    await record_audit(db, user, "plan.created", "plan", plan["id"], plan["name"], request=request, platform=True)
    return success_response(data=plan, message="Plan added.", status_code=status.HTTP_201_CREATED)


@router.patch("/{plan_id}", summary="Change a plan (its code stays the same)")
async def update_plan(
    plan_id: str,
    body: Dict[str, Any],
    request: Request,
    user: dict = Depends(require_superadmin),
    service: PlanService = Depends(get_service),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    plan = await service.update(plan_id, body)
    await record_audit(db, user, "plan.updated", "plan", plan_id, plan["name"], {"fields": sorted(body)},
                       request=request, platform=True)
    return success_response(data=plan, message="Plan saved. Companies already on it keep their limits until you change them.")


@router.delete("/{plan_id}", summary="Delete a plan no company uses")
async def delete_plan(
    plan_id: str,
    request: Request,
    user: dict = Depends(require_superadmin),
    service: PlanService = Depends(get_service),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    plan = await service.get(plan_id)
    await service.delete(plan_id)
    await record_audit(db, user, "plan.deleted", "plan", plan_id, plan["name"], request=request, platform=True)
    return success_response(data=None, message="Plan deleted.")
