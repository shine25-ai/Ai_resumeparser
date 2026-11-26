"""
Master data (SRS 4.20). Company users see the platform's entries plus their company's own and may add their
own (masters:create/edit/delete). The super admin manages the platform list with ?scope=platform.
"""

from typing import Optional

from fastapi import APIRouter, Depends, Query, Request, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from app.core.database import get_database
from app.core.dependencies import is_superadmin, require_access
from app.core.exceptions import AuthorizationError
from app.core.tenant import system_scope
from app.services.audit_service import record_audit
from app.services.master_service import MasterService, master_types_payload
from app.utils.response import success_response

_MASTERS_ACCESS = require_access("masters")
router = APIRouter(prefix="/api/v1/masters", tags=["Master Data"])

ScopeParam = Query("company", pattern="^(company|platform)$", description="platform = the super admin's global list")


class MasterCreate(BaseModel):
    type: str = Field(..., max_length=40)
    name: str = Field(..., min_length=1, max_length=120)
    parent: Optional[str] = Field(default="", max_length=120, description="e.g. the skill group of a skill")


class MasterUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    parent: Optional[str] = Field(default=None, max_length=120)
    is_active: Optional[bool] = None


def get_master_service(db: AsyncIOMotorDatabase = Depends(get_database)) -> MasterService:
    return MasterService(db)


def _platform(scope: str, user: dict) -> bool:
    if scope != "platform":
        return False
    if not is_superadmin(user):
        raise AuthorizationError("Only the platform super admin can change the platform list.")
    return True


@router.get("/types", summary="Master data types")
async def list_types(_user: dict = Depends(_MASTERS_ACCESS)):
    return success_response(data=master_types_payload(), message="Master data types retrieved.")


@router.get("", summary="Entries of one type: the platform's plus your company's")
async def list_masters(
    type: str = Query(..., max_length=40),
    search: str = Query("", max_length=120),
    include_inactive: bool = Query(False),
    scope: str = ScopeParam,
    user: dict = Depends(_MASTERS_ACCESS),
    service: MasterService = Depends(get_master_service),
):
    if _platform(scope, user):
        with system_scope():
            data = [d for d in await service.list(type, include_inactive, search) if d["is_global"]]
    else:
        data = await service.list(type, include_inactive, search)
    return success_response(data=data, message="Master data retrieved.")


@router.post("", status_code=status.HTTP_201_CREATED, summary="Add an entry")
async def create_master(
    request: Request,
    body: MasterCreate,
    scope: str = ScopeParam,
    user: dict = Depends(_MASTERS_ACCESS),
    service: MasterService = Depends(get_master_service),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    data = await service.create(body.type, body.name, body.parent or "", global_entry=_platform(scope, user))
    await record_audit(db, user, "master.created", f"master:{body.type}", data["id"], data["name"], request=request, platform=(scope == "platform"))
    return success_response(data=data, message="Entry added.", status_code=status.HTTP_201_CREATED)


@router.patch("/{master_id}", summary="Rename, regroup or turn an entry on/off")
async def update_master(
    request: Request,
    master_id: str,
    body: MasterUpdate,
    scope: str = ScopeParam,
    user: dict = Depends(_MASTERS_ACCESS),
    service: MasterService = Depends(get_master_service),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    data = await service.update(master_id, body.model_dump(exclude_unset=True), global_entry=_platform(scope, user))
    await record_audit(db, user, "master.updated", f"master:{data['type']}", master_id, data["name"], {k: {"to": v} for k, v in body.model_dump(exclude_unset=True).items()}, request=request, platform=(scope == "platform"))
    return success_response(data=data, message="Entry updated.")


@router.delete("/{master_id}", summary="Turn an entry off")
async def delete_master(
    request: Request,
    master_id: str,
    scope: str = ScopeParam,
    user: dict = Depends(_MASTERS_ACCESS),
    service: MasterService = Depends(get_master_service),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    await service.delete(master_id, global_entry=_platform(scope, user))
    await record_audit(db, user, "master.turned_off", "master", master_id, request=request, platform=(scope == "platform"))
    return success_response(data=None, message="Entry turned off.")
