"""
Resume repository for MongoDB database queries regarding Resume entities.
"""

from typing import Any, Dict, List, Optional
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.repositories.base_repository import BaseRepository
from app.utils.constants import RESUMES_COLLECTION
from app.utils.enums import ResumeStatus
from typing import Any, Dict, List


class ResumeRepository(BaseRepository):
    """Repository handling database operations for resumes collection."""

    def __init__(self, db: AsyncIOMotorDatabase):
        super().__init__(db, RESUMES_COLLECTION)

    async def get_by_id(self, id_val: str) -> Optional[Dict[str, Any]]:
        """Find a single document by string 'id' field, following redirect_id or resume_logs mapping if merged."""
        doc = await super().get_by_id(id_val)
        if doc:
            if doc.get("redirect_id"):
                target_doc = await super().get_by_id(doc["redirect_id"])
                if target_doc:
                    return target_doc
            return doc
        
        # If temporary upload document was deleted after merging into candidate profile
        from app.utils.constants import RESUME_LOGS_COLLECTION
        log_entry = await self.db[RESUME_LOGS_COLLECTION].find_one({"temp_upload_id": id_val})
        if log_entry and log_entry.get("resume_id"):
            return await super().get_by_id(log_entry["resume_id"])
            
        return None

    async def get_by_user_id(
        self,
        user_id: Optional[str] = None,
        skip: int = 0,
        limit: int = 100,
        is_admin: bool = False,
        search: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Fetch list of resumes belonging to user (or all resumes if is_admin or user_id is None)."""
        import re
        from loguru import logger
        query: Dict[str, Any] = {"$or": [{"redirect_id": None}, {"redirect_id": {"$exists": False}}]}
        if user_id and not is_admin:
            query["user_id"] = user_id

        if search and search.strip():
            s_regex = re.compile(re.escape(search.strip()), re.IGNORECASE)
            search_or = [
                {"parsed_data.name": {"$regex": s_regex}},
                {"parsed_data.full_name": {"$regex": s_regex}},
                {"parsed_data.email": {"$regex": s_regex}},
                {"email": {"$regex": s_regex}},
                {"parsed_data.designation": {"$regex": s_regex}},
                {"parsed_data.role": {"$regex": s_regex}},
                {"candidate_id": {"$regex": s_regex}},
                {"original_filename": {"$regex": s_regex}},
                {"extracted_text": {"$regex": s_regex}},
                {"resume_source": {"$regex": s_regex}},
            ]
            query = {"$and": [query, {"$or": search_or}]}

        logger.info(f"[GET_BY_USER_ID] Executing MongoDB query: {query}, skip={skip}, limit={limit}, is_admin={is_admin}")
        results = await self.find_many(query=query, skip=skip, limit=limit, sort_by="upload_date", descending=True)
        logger.info(f"[GET_BY_USER_ID] Query returned {len(results)} resume document(s)")
        return results

    async def count_by_user_id(self, user_id: Optional[str] = None, is_admin: bool = False, search: Optional[str] = None) -> int:
        """Count total resumes (or all resumes if is_admin or user_id is None)."""
        import re
        from loguru import logger
        query: Dict[str, Any] = {"$or": [{"redirect_id": None}, {"redirect_id": {"$exists": False}}]}
        if user_id and not is_admin:
            query["user_id"] = user_id

        if search and search.strip():
            s_regex = re.compile(re.escape(search.strip()), re.IGNORECASE)
            search_or = [
                {"parsed_data.name": {"$regex": s_regex}},
                {"parsed_data.full_name": {"$regex": s_regex}},
                {"parsed_data.email": {"$regex": s_regex}},
                {"email": {"$regex": s_regex}},
                {"parsed_data.designation": {"$regex": s_regex}},
                {"parsed_data.role": {"$regex": s_regex}},
                {"candidate_id": {"$regex": s_regex}},
                {"original_filename": {"$regex": s_regex}},
                {"extracted_text": {"$regex": s_regex}},
                {"resume_source": {"$regex": s_regex}},
            ]
            query = {"$and": [query, {"$or": search_or}]}

        count_val = await self.count(query=query)
        logger.info(f"[COUNT_BY_USER_ID] Count query: {query} -> Total: {count_val}")
        return count_val

    async def filter_resumes(
        self,
        user_id: Optional[str] = None,
        job_title: Optional[List[str]] = None,
        min_experience: Optional[float] = None,
        max_experience: Optional[float] = None,
        location: Optional[List[str]] = None,
        employment_type: Optional[List[str]] = None,
        year_of_passing: Optional[List[str]] = None,
        skills: Optional[List[str]] = None,
        keywords: Optional[List[str]] = None,
        search: Optional[str] = None,
        name: Optional[str] = None,
        email: Optional[str] = None,
        role: Optional[str] = None,
        experience: Optional[float] = None,
        skip: int = 0,
        limit: int = 100,
        is_admin: bool = False,
    ) -> Dict[str, Any]:
        """Filter resumes based on multiple criteria matching parsed_data fields and return (results, total)."""
        import re

        and_conditions: List[Dict[str, Any]] = [{"$or": [{"redirect_id": None}, {"redirect_id": {"$exists": False}}]}]
        if user_id and not is_admin:
            and_conditions.append({"user_id": user_id})

        # Global search filter across name, email, role, candidate_id, source, text
        if search and search.strip():
            s_regex = re.compile(re.escape(search.strip()), re.IGNORECASE)
            and_conditions.append({
                "$or": [
                    {"parsed_data.name": {"$regex": s_regex}},
                    {"parsed_data.full_name": {"$regex": s_regex}},
                    {"parsed_data.email": {"$regex": s_regex}},
                    {"email": {"$regex": s_regex}},
                    {"parsed_data.designation": {"$regex": s_regex}},
                    {"parsed_data.role": {"$regex": s_regex}},
                    {"candidate_id": {"$regex": s_regex}},
                    {"original_filename": {"$regex": s_regex}},
                    {"extracted_text": {"$regex": s_regex}},
                    {"resume_source": {"$regex": s_regex}},
                ]
            })

        # Specific Field Searches: Name, Email, Role, Experience
        if name and name.strip():
            n_regex = re.compile(re.escape(name.strip()), re.IGNORECASE)
            and_conditions.append({
                "$or": [
                    {"parsed_data.name": {"$regex": n_regex}},
                    {"parsed_data.full_name": {"$regex": n_regex}},
                ]
            })

        if email and email.strip():
            e_regex = re.compile(re.escape(email.strip()), re.IGNORECASE)
            and_conditions.append({
                "$or": [
                    {"parsed_data.email": {"$regex": e_regex}},
                    {"email": {"$regex": e_regex}},
                ]
            })

        if role and role.strip():
            r_regex = re.compile(re.escape(role.strip()), re.IGNORECASE)
            and_conditions.append({
                "$or": [
                    {"parsed_data.designation": {"$regex": r_regex}},
                    {"parsed_data.role": {"$regex": r_regex}},
                ]
            })

        if experience is not None:
            and_conditions.append({
                "$or": [
                    {"parsed_data.total_experience_years": {"$gte": experience}},
                    {"parsed_data.years_of_experience": {"$gte": experience}},
                ]
            })

        if job_title and any(j.strip() for j in job_title):
            jt_queries = []
            for j in job_title:
                if j.strip():
                    jt_regex = re.compile(re.escape(j.strip()), re.IGNORECASE)
                    jt_queries.append({
                        "$or": [
                            {"parsed_data.designation": {"$regex": jt_regex}},
                            {"parsed_data.role": {"$regex": jt_regex}},
                            {"parsed_data.name": {"$regex": jt_regex}},
                            {"parsed_data.full_name": {"$regex": jt_regex}},
                            {"parsed_data.experience.designation": {"$regex": jt_regex}},
                            {"parsed_data.experience.company": {"$regex": jt_regex}},
                            {"parsed_data.primary_skills": {"$regex": jt_regex}},
                            {"extracted_text": {"$regex": jt_regex}},
                        ]
                    })
            if jt_queries:
                and_conditions.append({"$or": jt_queries})

        if min_experience is not None or max_experience is not None:
            exp_query: Dict[str, Any] = {}
            if min_experience is not None:
                exp_query["$gte"] = min_experience
            if max_experience is not None:
                exp_query["$lte"] = max_experience
            
            and_conditions.append({
                "$or": [
                    {"parsed_data.total_experience_years": exp_query},
                    {"parsed_data.years_of_experience": exp_query},
                ]
            })

        if location and any(l.strip() for l in location):
            loc_queries = []
            for l in location:
                if l.strip():
                    loc_regex = re.compile(re.escape(l.strip()), re.IGNORECASE)
                    loc_queries.append({
                        "$or": [
                            {"parsed_data.location": {"$regex": loc_regex}},
                            {"extracted_text": {"$regex": loc_regex}},
                        ]
                    })
            if loc_queries:
                and_conditions.append({"$or": loc_queries})

        if employment_type and any(e.strip() for e in employment_type):
            emp_queries = []
            for e in employment_type:
                if e.strip():
                    emp_clean = e.strip()
                    emp_pattern = re.escape(emp_clean).replace(r"\ ", r"[\s\-_]*")
                    emp_regex = re.compile(emp_pattern, re.IGNORECASE)
                    emp_queries.append({
                        "$or": [
                            {"parsed_data.employment_type": {"$regex": emp_regex}},
                            {"parsed_data.job_type": {"$regex": emp_regex}},
                            {"extracted_text": {"$regex": emp_regex}},
                        ]
                    })
            if emp_queries:
                and_conditions.append({"$or": emp_queries})

        if year_of_passing and any(y.strip() for y in year_of_passing):
            yop_queries = []
            for y in year_of_passing:
                if y.strip():
                    yop_regex = re.compile(re.escape(y.strip()), re.IGNORECASE)
                    yop_queries.append({
                        "$or": [
                            {"parsed_data.education.year_of_passing": {"$regex": yop_regex}},
                            {"parsed_data.education.year": {"$regex": yop_regex}},
                            {"extracted_text": {"$regex": yop_regex}},
                        ]
                    })
            if yop_queries:
                and_conditions.append({"$or": yop_queries})

        if skills and any(s.strip() for s in skills):
            skill_queries = []
            for s in skills:
                if s.strip():
                    s_regex = re.compile(re.escape(s.strip()), re.IGNORECASE)
                    skill_queries.append({
                        "$or": [
                            {"parsed_data.skills": {"$regex": s_regex}},
                            {"parsed_data.primary_skills": {"$regex": s_regex}},
                            {"parsed_data.frameworks": {"$regex": s_regex}},
                            {"parsed_data.databases": {"$regex": s_regex}},
                            {"parsed_data.cloud_tech": {"$regex": s_regex}},
                        ]
                    })
            if skill_queries:
                and_conditions.append({"$or": skill_queries})
                
        if keywords and any(k.strip() for k in keywords):
            keyword_queries = []
            for k in keywords:
                if k.strip():
                    k_regex = re.compile(re.escape(k.strip()), re.IGNORECASE)
                    keyword_queries.append({"extracted_text": {"$regex": k_regex}})
            if keyword_queries:
                and_conditions.append({"$or": keyword_queries})

        from loguru import logger
        logger.info(f"[FILTER_RESUMES] Params received -> user_id: {user_id}, search: {search}, name: {name}, email: {email}, role: {role}, exp: {experience}")

        final_query = {"$and": and_conditions} if len(and_conditions) > 1 else and_conditions[0]
        results = await self.find_many(query=final_query, skip=skip, limit=limit, sort_by="upload_date", descending=True)
        total_count = await self.count(query=final_query)
        logger.info(f"[FILTER_RESUMES] Returned {len(results)} matching resume document(s), total={total_count}")
        return {"resumes": results, "total": total_count}

    async def find_by_user_and_filename(self, user_id: str, original_filename: str) -> Optional[Dict[str, Any]]:
        """Check if user has already uploaded a file with the same original filename."""
        return await self.find_one({"user_id": user_id, "original_filename": original_filename})

    async def find_by_file_hash(self, file_hash: str) -> Optional[Dict[str, Any]]:
        """Check if a file with this hash already exists across the system."""
        return await self.find_one({"file_hash": file_hash})

    async def find_by_email(self, email: str, user_id: Optional[str] = None, exclude_resume_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Check if a parsed resume already exists with this email across MongoDB (case-insensitive)."""
        import re
        from loguru import logger
        if not email or not isinstance(email, str) or not email.strip():
            return None
        email_clean = email.strip()
        email_regex = re.compile(f"^{re.escape(email_clean)}$", re.IGNORECASE)
        
        email_or_conditions = [
            {"parsed_data.email": {"$regex": email_regex}},
            {"email": {"$regex": email_regex}},
        ]
        
        query: Dict[str, Any] = {
            "$or": email_or_conditions,
            "redirect_id": {"$in": [None, None]}
        }
        
        # Exclude temporary upload document if ID provided
        if exclude_resume_id:
            query["id"] = {"$ne": exclude_resume_id}

        logger.info(f"[FIND_BY_EMAIL] Searching MongoDB for candidate with email '{email_clean}'...")
        result = await self.find_one(query)
        
        # Fallback check without redirect_id filter if needed
        if not result:
            fallback_query: Dict[str, Any] = {"$or": email_or_conditions}
            if exclude_resume_id:
                fallback_query["id"] = {"$ne": exclude_resume_id}
            result = await self.find_one(fallback_query)

        if result:
            logger.info(f"[FIND_BY_EMAIL] SUCCESS: Found existing candidate document ID '{result['id']}' for email '{email_clean}'")
        else:
            logger.info(f"[FIND_BY_EMAIL] NO MATCH: No existing candidate document found in MongoDB for email '{email_clean}'")

        return result

    async def update_status_and_text(self, resume_id: str, status: ResumeStatus, extracted_text: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Update resume extraction status and extracted text content."""
        update_fields: Dict[str, Any] = {"status": status.value}
        if extracted_text is not None:
            update_fields["extracted_text"] = extracted_text
        return await self.update(resume_id, update_fields)

    async def update_resume_fields(
        self,
        resume_id: str,
        update_fields: Dict[str, Any],
        hr_update: Optional[Dict[str, Any]] = None,
    ) -> Optional[Dict[str, Any]]:
        """Update resume document fields directly and optionally push a new HR Update entry."""
        mongo_update: Dict[str, Any] = {}
        if update_fields:
            mongo_update["$set"] = update_fields
        if hr_update:
            mongo_update["$push"] = {"hr_updates": hr_update}

        if mongo_update:
            await self.collection.update_one({"id": resume_id}, mongo_update)
        return await self.get_by_id(resume_id)

    async def get_parsed_resume_summary(
        self,
        user_id: Optional[str] = None,
        skip: int = 0,
        limit: int = 100,
        is_admin: bool = False,
    ) -> List[Dict[str, Any]]:
        """
        Return only required parsed resume fields where status is PARSED.
        """
        query: Dict[str, Any] = {
            "status": ResumeStatus.PARSED.value,
            "$or": [{"redirect_id": None}, {"redirect_id": {"$exists": False}}],
        }
        if user_id and not is_admin:
            query["user_id"] = user_id

        projection = {
            "_id": 0,
            "id": 1,
            "original_filename": 1,
            "upload_date": 1,
            "status": 1,
            "parsed_data.location": 1,
            "parsed_data.total_experience_years": 1,
            "parsed_data.primary_skills": 1,
            "parsed_data.frameworks": 1,
            "parsed_data.databases": 1,
            "parsed_data.designation": 1,
            "parsed_data.role": 1,
            "parsed_data.experience": 1,
            "parsed_data.projects": 1,
            "parsed_data.education": 1,
            "parsed_data.experience_level": 1,
            "ai_evaluation.experience_level": 1,
            "ai_evaluation.ai_technical_score": 1,
            "ai_evaluation.personality_analysis": 1,
        }

        cursor = (
            self.collection
            .find(query, projection)
            .sort("upload_date", -1)
            .skip(skip)
            .limit(limit)
        )

        return await cursor.to_list(length=limit)