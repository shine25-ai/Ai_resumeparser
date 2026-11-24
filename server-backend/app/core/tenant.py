"""
Company (tenant) isolation.

Every request runs for one company. The company comes from the signed-in user (a super admin can switch
company), the careers page address, the opening applied for, or the integration API key. The database
handed to repositories is wrapped so every read and write on a company's collections is limited to that
company, and new documents are stamped with it. Repositories need no company filters of their own.

When no company has been set, a company collection refuses to be used instead of returning every company's
data. Startup jobs, sign-in and the super admin's own screens run in `system_scope()`, which sees everything.
"""

from contextlib import contextmanager
from contextvars import ContextVar
from typing import Any, Dict, Generator, Iterator, List, Optional

from motor.motor_asyncio import AsyncIOMotorCollection, AsyncIOMotorDatabase

COMPANY_FIELD = "company_id"

# Collections holding one company's data. Everything else (companies, counters, applicant email codes,
# AI caches keyed by query text) is shared by the platform.
TENANT_COLLECTIONS = frozenset({
    "users",
    "roles",
    "resumes",
    "resume_logs",
    "resume_embeddings",
    "interviews",
    "skills_evaluations",
    "interview_types",
    "job_openings",
    "careers_page_settings",
    "job_applications",
    "integration_api_keys",
    "integration_api_logs",
    "settings",
    "mail_templates",
    "resume_templates",
    "masters",
    "audit_logs",
    "user_invitations",
    "job_templates",
    "career_pages",
    "application_drafts",
    "candidates",
    "candidate_documents",
    "interview_panels",
    "evaluation_forms",
    "interview_evaluations",
    "candidate_skills",
    "notifications",
    "notification_logs",
    "usage_meters",
    # ATS hub (pipeline, offers, onboarding, scorecards, automation templates, its audit trail)
    "ats_audit_logs",
    "ats_automation_templates",
    "ats_offers",
    "ats_onboarding",
    "ats_scorecards",
})

# In these, documents with no company (built-in system roles, platform master data) can be read by every
# company, but only changed from system scope.
SHARED_READ_COLLECTIONS = frozenset({"roles", "masters"})

_SYSTEM = "__system__"
_scope: ContextVar[Optional[str]] = ContextVar("company_scope", default=None)


class TenantScopeError(RuntimeError):
    """A company collection was used before the request's company was known."""


def set_company(company_id: str) -> None:
    """Limit the rest of this request (and its background tasks) to one company."""
    if not company_id:
        raise TenantScopeError("A company is required.")
    _scope.set(company_id)


def current_company_id() -> Optional[str]:
    """The request's company, or None in system scope or before it is known."""
    value = _scope.get()
    return None if value in (None, _SYSTEM) else value


def in_system_scope() -> bool:
    return _scope.get() == _SYSTEM


@contextmanager
def system_scope() -> Generator[None, None, None]:
    """See and change every company's data. For startup jobs, sign-in and super admin screens only."""
    token = _scope.set(_SYSTEM)
    try:
        yield
    finally:
        _scope.reset(token)


@contextmanager
def company_scope(company_id: str) -> Generator[None, None, None]:
    """Run a block for one company, then return to the previous scope."""
    if not company_id:
        raise TenantScopeError("A company is required.")
    token = _scope.set(company_id)
    try:
        yield
    finally:
        _scope.reset(token)


def _company_or_raise(collection: str) -> Optional[str]:
    """None means system scope (no filter)."""
    value = _scope.get()
    if value == _SYSTEM:
        return None
    if value is None:
        raise TenantScopeError(f"'{collection}' was used before the company was known.")
    return value


def _and(query: Optional[Dict[str, Any]], condition: Dict[str, Any]) -> Dict[str, Any]:
    query = dict(query or {})
    if not query:
        return dict(condition)
    if set(condition).isdisjoint(query) and "$or" not in condition:
        # A plain equality on company_id keeps upserts stamping the company on the new document.
        return {**query, **condition}
    return {"$and": [query, condition]}


class ScopedCollection:
    """A Motor collection limited to the request's company. Unknown attributes pass through (name, indexes)."""

    def __init__(self, collection: AsyncIOMotorCollection):
        self._c = collection
        self._name = collection.name
        self._shared_read = self._name in SHARED_READ_COLLECTIONS

    # ── filters ──
    def _read(self, query: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        company = _company_or_raise(self._name)
        if company is None:
            return dict(query or {})
        if self._shared_read:
            return _and(query, {"$or": [{COMPANY_FIELD: company}, {COMPANY_FIELD: None}]})
        return _and(query, {COMPANY_FIELD: company})

    def _write(self, query: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        company = _company_or_raise(self._name)
        return dict(query or {}) if company is None else _and(query, {COMPANY_FIELD: company})

    def _stamp(self, doc: Dict[str, Any]) -> Dict[str, Any]:
        company = _company_or_raise(self._name)
        if company is None:
            return doc
        if doc.get(COMPANY_FIELD) not in (None, company):
            raise TenantScopeError(f"Cannot write another company's document to '{self._name}'.")
        doc[COMPANY_FIELD] = company
        return doc

    def _check_update(self, update: Any) -> Any:
        """Documents cannot be moved to another company."""
        company = _company_or_raise(self._name)
        if company is None or not isinstance(update, dict):
            return update
        for op, fields in update.items():
            if isinstance(fields, dict) and COMPANY_FIELD in fields:
                if op not in ("$set", "$setOnInsert") or fields[COMPANY_FIELD] != company:
                    raise TenantScopeError(f"Cannot change the company of a document in '{self._name}'.")
        return update

    # ── reads ──
    def find(self, filter: Optional[Dict[str, Any]] = None, *args: Any, **kwargs: Any):
        return self._c.find(self._read(filter), *args, **kwargs)

    async def find_one(self, filter: Optional[Dict[str, Any]] = None, *args: Any, **kwargs: Any):
        return await self._c.find_one(self._read(filter), *args, **kwargs)

    async def count_documents(self, filter: Optional[Dict[str, Any]] = None, *args: Any, **kwargs: Any) -> int:
        return await self._c.count_documents(self._read(filter), *args, **kwargs)

    async def estimated_document_count(self, *args: Any, **kwargs: Any) -> int:
        if _company_or_raise(self._name) is None:
            return await self._c.estimated_document_count(*args, **kwargs)
        return await self.count_documents({})

    async def distinct(self, key: str, filter: Optional[Dict[str, Any]] = None, *args: Any, **kwargs: Any):
        return await self._c.distinct(key, self._read(filter), *args, **kwargs)

    def aggregate(self, pipeline: List[Dict[str, Any]], *args: Any, **kwargs: Any):
        company = _company_or_raise(self._name)
        if company is not None:
            for stage in pipeline:
                if any(k in stage for k in ("$lookup", "$unionWith", "$out", "$merge", "$graphLookup")):
                    raise TenantScopeError(f"'{next(iter(stage))}' is not allowed on '{self._name}' in a company scope.")
            pipeline = [{"$match": self._read({})}, *pipeline]
        return self._c.aggregate(pipeline, *args, **kwargs)

    # ── writes ──
    async def insert_one(self, document: Dict[str, Any], *args: Any, **kwargs: Any):
        return await self._c.insert_one(self._stamp(document), *args, **kwargs)

    async def insert_many(self, documents: List[Dict[str, Any]], *args: Any, **kwargs: Any):
        return await self._c.insert_many([self._stamp(d) for d in documents], *args, **kwargs)

    async def update_one(self, filter: Dict[str, Any], update: Any, *args: Any, **kwargs: Any):
        return await self._c.update_one(self._write(filter), self._check_update(update), *args, **kwargs)

    async def update_many(self, filter: Dict[str, Any], update: Any, *args: Any, **kwargs: Any):
        return await self._c.update_many(self._write(filter), self._check_update(update), *args, **kwargs)

    async def replace_one(self, filter: Dict[str, Any], replacement: Dict[str, Any], *args: Any, **kwargs: Any):
        return await self._c.replace_one(self._write(filter), self._stamp(dict(replacement)), *args, **kwargs)

    async def find_one_and_update(self, filter: Dict[str, Any], update: Any, *args: Any, **kwargs: Any):
        return await self._c.find_one_and_update(self._write(filter), self._check_update(update), *args, **kwargs)

    async def find_one_and_replace(self, filter: Dict[str, Any], replacement: Dict[str, Any], *args: Any, **kwargs: Any):
        return await self._c.find_one_and_replace(self._write(filter), self._stamp(dict(replacement)), *args, **kwargs)

    async def find_one_and_delete(self, filter: Dict[str, Any], *args: Any, **kwargs: Any):
        return await self._c.find_one_and_delete(self._write(filter), *args, **kwargs)

    async def delete_one(self, filter: Dict[str, Any], *args: Any, **kwargs: Any):
        return await self._c.delete_one(self._write(filter), *args, **kwargs)

    async def delete_many(self, filter: Dict[str, Any], *args: Any, **kwargs: Any):
        return await self._c.delete_many(self._write(filter), *args, **kwargs)

    async def bulk_write(self, requests: Any, *args: Any, **kwargs: Any):
        if _company_or_raise(self._name) is not None:
            raise TenantScopeError(f"bulk_write on '{self._name}' is only allowed in system scope.")
        return await self._c.bulk_write(requests, *args, **kwargs)

    def watch(self, *args: Any, **kwargs: Any):
        raise TenantScopeError("Change streams are not available on company collections.")

    @property
    def raw(self) -> AsyncIOMotorCollection:
        return self._c

    def __getattr__(self, item: str) -> Any:
        return getattr(self._c, item)


class ScopedDatabase:
    """A Motor database whose company collections are ScopedCollections."""

    def __init__(self, db: Any):
        self._db = db

    def _wrap(self, collection: AsyncIOMotorCollection):
        return ScopedCollection(collection) if collection.name in TENANT_COLLECTIONS else collection

    def __getitem__(self, name: str):
        return self._wrap(self._db[name])

    def get_collection(self, name: str, *args: Any, **kwargs: Any):
        return self._wrap(self._db.get_collection(name, *args, **kwargs))

    @property
    def raw(self) -> AsyncIOMotorDatabase:
        return self._db

    def __getattr__(self, item: str) -> Any:
        # Motor's db.<name> attribute access returns a collection; keep it scoped too.
        attr = getattr(self._db, item)
        return self._wrap(attr) if isinstance(attr, AsyncIOMotorCollection) else attr
