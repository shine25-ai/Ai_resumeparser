"""
InterviewType service handling business logic and CRUD operations for Interview Types.
"""

from typing import List
import re
from app.core.exceptions import BadRequestError, ConflictError, NotFoundError
from app.models.interview_type import InterviewTypeDocument
from app.repositories.interview_type_repository import InterviewTypeRepository
from app.schemas.interview_type import InterviewTypeCreate, InterviewTypeResponse, InterviewTypeUpdate
from app.utils.helpers import utc_now


class InterviewTypeService:
    """Service handling Interview Type management operations."""

    def __init__(self, repository: InterviewTypeRepository):
        self.repository = repository

    def _generate_code(self, name: str) -> str:
        """Generate upper-case code slug from name."""
        clean = re.sub(r"[^\w\s]", "", name.upper()).strip()
        return re.sub(r"[\s_]+", "_", clean)

    async def list_interview_types(
        self, skip: int = 0, limit: int = 100, include_inactive: bool = True
    ) -> List[InterviewTypeResponse]:
        """Fetch list of all active interview types."""
        docs = await self.repository.find_all_interview_types(
            skip=skip, limit=limit, include_inactive=include_inactive
        )
        return [InterviewTypeResponse.model_validate(d) for d in docs]

    async def get_interview_type(self, id_val: str) -> InterviewTypeResponse:
        """Retrieve single interview type by ID."""
        doc = await self.repository.get_by_id(id_val)
        if not doc or doc.get("is_deleted", False):
            raise NotFoundError("Interview type not found.")
        return InterviewTypeResponse.model_validate(doc)

    async def create_interview_type(self, payload: InterviewTypeCreate) -> InterviewTypeResponse:
        """Create a new custom Interview Type."""
        name_clean = payload.name.strip()
        code = payload.code.strip().upper() if payload.code else self._generate_code(name_clean)

        existing = await self.repository.get_by_code(code)
        if existing:
            raise ConflictError(f"Interview type with code '{code}' already exists.")

        doc = InterviewTypeDocument(
            name=name_clean,
            code=code,
            description=payload.description or "",
            color=payload.color or "#4F46E5",
            is_active=payload.is_active if payload.is_active is not None else True,
            is_system=False,
        )

        created = await self.repository.create(doc.to_dict())
        return InterviewTypeResponse.model_validate(created)

    async def update_interview_type(
        self, id_val: str, payload: InterviewTypeUpdate
    ) -> InterviewTypeResponse:
        """Update existing Interview Type."""
        doc = await self.repository.get_by_id(id_val)
        if not doc or doc.get("is_deleted", False):
            raise NotFoundError("Interview type not found.")

        update_dict = payload.model_dump(exclude_unset=True)
        if not update_dict:
            return InterviewTypeResponse.model_validate(doc)

        if "name" in update_dict and update_dict["name"]:
            update_dict["name"] = update_dict["name"].strip()

        if "code" in update_dict and update_dict["code"]:
            code_clean = update_dict["code"].strip().upper()
            if code_clean != doc.get("code"):
                existing = await self.repository.get_by_code(code_clean)
                if existing and existing.get("id") != id_val:
                    raise ConflictError(f"Interview type with code '{code_clean}' already exists.")
            update_dict["code"] = code_clean

        update_dict["updated_at"] = utc_now().isoformat()
        updated_doc = await self.repository.update(id_val, update_dict)
        return InterviewTypeResponse.model_validate(updated_doc)

    async def delete_interview_type(self, id_val: str) -> bool:
        """Soft delete Interview Type by ID."""
        doc = await self.repository.get_by_id(id_val)
        if not doc or doc.get("is_deleted", False):
            raise NotFoundError("Interview type not found.")

        if doc.get("is_system", False):
            raise BadRequestError("System default interview types cannot be deleted.")

        return await self.repository.soft_delete(id_val)
