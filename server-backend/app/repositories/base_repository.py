"""
Generic Async MongoDB repository providing reusable CRUD operations.
"""

from typing import Any, Dict, List, Optional
from motor.motor_asyncio import AsyncIOMotorCollection, AsyncIOMotorDatabase


class BaseRepository:
    """Base generic MongoDB repository using Motor driver."""

    def __init__(self, db: AsyncIOMotorDatabase, collection_name: str):
        self.db = db
        self.collection_name = collection_name
        self.collection: AsyncIOMotorCollection = db[collection_name]

    def _sanitize_doc(self, doc: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        if doc and "_id" in doc:
            doc["_id"] = str(doc["_id"])
        return doc

    async def create(self, document: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Insert a single document into MongoDB."""
        await self.collection.insert_one(document)
        return self._sanitize_doc(document)

    async def get_by_id(self, id_val: str) -> Optional[Dict[str, Any]]:
        """Find a single document by string 'id' field."""
        doc = await self.collection.find_one({"id": id_val})
        return self._sanitize_doc(doc)

    async def find_one(self, query: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Find a single document matching query filter."""
        doc = await self.collection.find_one(query)
        return self._sanitize_doc(doc)

    async def find_many(
        self,
        query: Optional[Dict[str, Any]] = None,
        skip: int = 0,
        limit: int = 100,
        sort_by: Optional[str] = None,
        descending: bool = True,
    ) -> List[Dict[str, Any]]:
        """Find multiple documents matching query with pagination and sorting."""
        query = query or {}
        cursor = self.collection.find(query).skip(skip).limit(limit)

        if sort_by:
            direction = -1 if descending else 1
            cursor = cursor.sort(sort_by, direction)

        docs = await cursor.to_list(length=limit)
        return [d for doc in docs if (d := self._sanitize_doc(doc)) is not None]

    async def count(self, query: Optional[Dict[str, Any]] = None) -> int:
        """Count total matching documents."""
        query = query or {}
        return await self.collection.count_documents(query)

    async def update(self, id_val: str, update_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Update a document by string 'id' field and return updated document."""
        await self.collection.update_one({"id": id_val}, {"$set": update_data})
        return await self.get_by_id(id_val)

    async def delete(self, id_val: str) -> bool:
        """Delete a document by string 'id' field."""
        result = await self.collection.delete_one({"id": id_val})
        return result.deleted_count > 0
