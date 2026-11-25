"""
A tiny in-memory stand-in for a Motor database: enough of find/insert/update/count and the query operators
the services use ($ne, $regex, $or, $and, $gte, $lte, $exists, $in). Wrap it in ScopedDatabase to test
company isolation end to end without MongoDB.
"""

import copy
import re
from typing import Any, Dict, List, Optional


def _get(doc: Dict[str, Any], path: str) -> Any:
    cur: Any = doc
    for part in path.split("."):
        if not isinstance(cur, dict) or part not in cur:
            return _MISSING
        cur = cur[part]
    return cur


_MISSING = object()


def _match_value(value: Any, cond: Any) -> bool:
    if isinstance(cond, dict) and cond and all(k.startswith("$") for k in cond):
        for op, arg in cond.items():
            v = None if value is _MISSING else value
            if op == "$ne" and v == arg:
                return False
            if op == "$in" and v not in arg:
                return False
            if op == "$all":
                if not isinstance(v, (list, tuple, set)) or not all(x in v for x in arg):
                    return False
            if op == "$nin" and v in arg:
                return False
            if op == "$exists" and (value is not _MISSING) != bool(arg):
                return False
            if op == "$gte" and not (v is not None and v >= arg):
                return False
            if op == "$lte" and not (v is not None and v <= arg):
                return False
            if op == "$gt" and not (v is not None and v > arg):
                return False
            if op == "$lt" and not (v is not None and v < arg):
                return False
            if op == "$regex":
                flags = re.I if "i" in cond.get("$options", "") else 0
                if isinstance(v, (list, tuple)):
                    if not any(isinstance(item, str) and re.search(arg, item, flags) for item in v):
                        return False
                elif not isinstance(v, str) or not re.search(arg, v, flags):
                    return False
        return True
    v = None if value is _MISSING else value
    return v == cond


def matches(doc: Dict[str, Any], query: Optional[Dict[str, Any]]) -> bool:
    for key, cond in (query or {}).items():
        if key == "$or":
            if not any(matches(doc, q) for q in cond):
                return False
        elif key == "$and":
            if not all(matches(doc, q) for q in cond):
                return False
        elif not _match_value(_get(doc, key), cond):
            return False
    return True


class _Cursor:
    def __init__(self, docs: List[Dict[str, Any]]):
        self._docs = docs

    def sort(self, key: Any, direction: int = 1):
        keys = key if isinstance(key, list) else [(key, direction)]
        for k, d in reversed(keys):
            def _sort_key(x):
                val = _get(x, k)
                if val is _MISSING or val is None:
                    return (0, 0, "")
                if isinstance(val, (int, float)):
                    return (1, float(val), "")
                return (2, 0, str(val))
            self._docs.sort(key=_sort_key, reverse=d < 0)
        return self

    def skip(self, n: int):
        self._docs = self._docs[n:]
        return self

    def limit(self, n: int):
        self._docs = self._docs[:n] if n else self._docs
        return self

    async def to_list(self, length: Optional[int] = None):
        return [copy.deepcopy(d) for d in (self._docs if length is None else self._docs[:length])]


class _Result:
    def __init__(self, **kw: Any):
        self.__dict__.update(kw)


class FakeCollection:
    def __init__(self, name: str):
        self.name = name
        self.docs: List[Dict[str, Any]] = []

    def find(self, query: Optional[Dict[str, Any]] = None, projection: Any = None, *a: Any, **k: Any):
        found = [d for d in self.docs if matches(d, query)]
        if isinstance(projection, dict) and projection.get("_id") == 0:
            found = [{k2: v for k2, v in d.items() if k2 != "_id"} for d in found]
        return _Cursor(found)

    async def find_one(self, query: Optional[Dict[str, Any]] = None, *a: Any, sort: Any = None, **k: Any):
        cur = _Cursor([d for d in self.docs if matches(d, query)])
        if sort:
            cur.sort(sort)
        docs = await cur.to_list(1)
        return docs[0] if docs else None

    async def count_documents(self, query: Optional[Dict[str, Any]] = None, *a: Any, **k: Any) -> int:
        return sum(1 for d in self.docs if matches(d, query))

    def aggregate(self, pipeline: Optional[List[Dict[str, Any]]] = None, *a: Any, **k: Any):
        docs = [d for d in self.docs]
        for stage in (pipeline or []):
            if "$match" in stage:
                docs = [d for d in docs if matches(d, stage["$match"])]
            elif "$group" in stage:
                grp = stage["$group"]
                by_key = grp.get("_id")
                grouped: Dict[Any, int] = {}
                for d in docs:
                    val = _get(d, by_key[1:]) if isinstance(by_key, str) and by_key.startswith("$") else None
                    if val is _MISSING:
                        val = None
                    grouped[val] = grouped.get(val, 0) + 1
                docs = [{"_id": k, "count": v} for k, v in grouped.items()]
            elif "$limit" in stage:
                docs = docs[:stage["$limit"]]
        return _Cursor(docs)

    async def insert_one(self, doc: Dict[str, Any], *a: Any, **k: Any):
        self.docs.append(copy.deepcopy(doc))
        return _Result(inserted_id=doc.get("id"))

    async def update_one(self, query: Dict[str, Any], update: Dict[str, Any], upsert: bool = False, *a: Any, **k: Any):
        for d in self.docs:
            if matches(d, query):
                d.update(copy.deepcopy(update.get("$set", {})))
                for field in update.get("$unset", {}):
                    d.pop(field, None)
                for field, value in update.get("$push", {}).items():
                    target = d.setdefault(field, [])
                    if isinstance(value, dict) and "$each" in value:
                        vals = value["$each"]
                        pos = value.get("$position")
                        if pos is not None:
                            for i, v in enumerate(vals):
                                target.insert(pos + i, copy.deepcopy(v))
                        else:
                            target.extend(copy.deepcopy(vals))
                    else:
                        target.append(copy.deepcopy(value))
                for field, value in update.get("$addToSet", {}).items():
                    target = d.setdefault(field, [])
                    vals = value.get("$each", [value]) if isinstance(value, dict) and "$each" in value else [value]
                    for v in vals:
                        if v not in target:
                            target.append(copy.deepcopy(v))
                for field, value in update.get("$pullAll", {}).items():
                    target = d.get(field, [])
                    d[field] = [x for x in target if x not in value]
                for field, value in update.get("$pull", {}).items():
                    target = d.get(field, [])
                    if isinstance(value, dict):
                        d[field] = [x for x in target if not matches(x, value)]
                    else:
                        d[field] = [x for x in target if x != value]
                for field, value in update.get("$inc", {}).items():
                    d[field] = d.get(field, 0) + value
                return _Result(matched_count=1, modified_count=1, upserted_id=None)
        if upsert:
            new = {k2: v for k2, v in query.items() if not k2.startswith("$") and not isinstance(v, dict)}
            new.update(update.get("$setOnInsert", {}))
            new.update(update.get("$set", {}))
            for field, value in update.get("$inc", {}).items():
                new[field] = new.get(field, 0) + value
            self.docs.append(copy.deepcopy(new))
            return _Result(matched_count=0, modified_count=0, upserted_id=new.get("id") or "new")
        return _Result(matched_count=0, modified_count=0, upserted_id=None)

    async def update_many(self, query: Dict[str, Any], update: Dict[str, Any], upsert: bool = False, *a: Any, **k: Any):
        count = 0
        for d in self.docs:
            if matches(d, query):
                d.update(copy.deepcopy(update.get("$set", {})))
                for field in update.get("$unset", {}):
                    d.pop(field, None)
                for field, value in update.get("$push", {}).items():
                    target = d.setdefault(field, [])
                    if isinstance(value, dict) and "$each" in value:
                        vals = value["$each"]
                        pos = value.get("$position")
                        if pos is not None:
                            for i, v in enumerate(vals):
                                target.insert(pos + i, copy.deepcopy(v))
                        else:
                            target.extend(copy.deepcopy(vals))
                    else:
                        target.append(copy.deepcopy(value))
                for field, value in update.get("$addToSet", {}).items():
                    target = d.setdefault(field, [])
                    vals = value.get("$each", [value]) if isinstance(value, dict) and "$each" in value else [value]
                    for v in vals:
                        if v not in target:
                            target.append(copy.deepcopy(v))
                for field, value in update.get("$pullAll", {}).items():
                    target = d.get(field, [])
                    d[field] = [x for x in target if x not in value]
                for field, value in update.get("$pull", {}).items():
                    target = d.get(field, [])
                    if isinstance(value, dict):
                        d[field] = [x for x in target if not matches(x, value)]
                    else:
                        d[field] = [x for x in target if x != value]
                for field, value in update.get("$inc", {}).items():
                    d[field] = d.get(field, 0) + value
                count += 1
        return _Result(matched_count=count, modified_count=count, upserted_id=None)

    async def delete_many(self, query: Dict[str, Any], *a: Any, **k: Any):
        before = len(self.docs)
        self.docs = [d for d in self.docs if not matches(d, query)]
        return _Result(deleted_count=before - len(self.docs))

    async def find_one_and_update(self, query: Dict[str, Any], update: Dict[str, Any], upsert: bool = False, **k: Any):
        await self.update_one(query, update, upsert=upsert)
        return await self.find_one(query)

    async def delete_one(self, query: Dict[str, Any], *a: Any, **k: Any):
        for i, d in enumerate(self.docs):
            if matches(d, query):
                self.docs.pop(i)
                return _Result(deleted_count=1)
        return _Result(deleted_count=0)

    async def create_index(self, *a: Any, **k: Any):
        return "idx"

    def aggregate(self, pipeline: List[Dict[str, Any]], *a: Any, **k: Any) -> _Cursor:
        docs = copy.deepcopy(self.docs)
        for stage in pipeline:
            if "$match" in stage:
                docs = [d for d in docs if matches(d, stage["$match"])]
            elif "$group" in stage:
                group_spec = stage["$group"]
                group_id_key = group_spec["_id"].lstrip("$")
                groups: Dict[Any, List[Dict[str, Any]]] = {}
                for d in docs:
                    gid = d.get(group_id_key)
                    groups.setdefault(gid, []).append(d)
                grouped_docs = []
                for gid, grp in groups.items():
                    out = {"_id": gid}
                    for field, expr in group_spec.items():
                        if field == "_id":
                            continue
                        if "$sum" in expr:
                            val = expr["$sum"]
                            out[field] = len(grp) if val == 1 else sum(g.get(val.lstrip("$"), 0) for g in grp)
                        elif "$avg" in expr:
                            avg_field = expr["$avg"].lstrip("$")
                            vals = [float(g.get(avg_field) or 0.0) for g in grp]
                            out[field] = sum(vals) / len(vals) if vals else 0.0
                    grouped_docs.append(out)
                docs = grouped_docs
            elif "$sort" in stage:
                for k, v in stage["$sort"].items():
                    docs.sort(key=lambda x: x.get(k) or 0, reverse=(v == -1))
            elif "$limit" in stage:
                docs = docs[: stage["$limit"]]
        return _Cursor(docs)


class FakeDatabase:
    def __init__(self):
        self.collections: Dict[str, FakeCollection] = {}

    def __getitem__(self, name: str) -> FakeCollection:
        return self.collections.setdefault(name, FakeCollection(name))

    get_collection = __getitem__
