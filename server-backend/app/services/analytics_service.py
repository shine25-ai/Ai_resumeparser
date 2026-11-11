from typing import Any, Dict, List, Optional
from datetime import datetime, timezone, timedelta
from app.core.database import get_database
from app.utils.constants import RESUMES_COLLECTION, INTERVIEWS_COLLECTION
from app.utils.enums import InterviewStatus
from app.utils.hiring_stage import stage_of, verdict_of

def _day(value: Any) -> str:
    """YYYY-MM-DD from an ISO string or datetime; '' when missing."""
    if isinstance(value, datetime):
        return value.date().isoformat()
    return str(value or "")[:10]


def _week_start(iso_day: str) -> str:
    d = datetime.strptime(iso_day, "%Y-%m-%d").date()
    return (d - timedelta(days=d.weekday())).isoformat()


class AnalyticsService:
    async def get_analytics_reports(self, days: Optional[int] = 30) -> Dict[str, Any]:
        """
        Analytics for the last `days` days (None = all time).

        Hiring numbers come from interviews, using Stage and Verdict
        (app/utils/hiring_stage.py). The weekly trend is counted from real dates.
        """
        db = get_database()
        resumes_coll = db[RESUMES_COLLECTION]
        interviews_coll = db[INTERVIEWS_COLLECTION]
        not_redirect = {"$or": [{"redirect_id": None}, {"redirect_id": {"$exists": False}}]}

        today = datetime.now(timezone.utc).date()
        start = (today - timedelta(days=days - 1)).isoformat() if days else ""
        end = today.isoformat()

        # 1. Stats, from resumes uploaded and interviews held in the period
        total_resumes = await resumes_coll.count_documents(not_redirect)
        upload_days = [
            _day(r.get("upload_date") or r.get("created_at"))
            async for r in resumes_coll.find(not_redirect, {"_id": 0, "upload_date": 1, "created_at": 1})
        ]
        upload_days = [d for d in upload_days if d and start <= d <= end]

        interview_query: Dict[str, Any] = {"status": {"$ne": InterviewStatus.CANCELLED.value}}
        if start:
            interview_query["scheduled_date"] = {"$gte": start, "$lte": end}
        else:
            interview_query["scheduled_date"] = {"$lte": end}
        interviews = await interviews_coll.find(
            interview_query, {"_id": 0, "scheduled_date": 1, "recommendation": 1, "status": 1}
        ).to_list(length=20000)
        for inv in interviews:
            inv["verdict"] = verdict_of(inv.get("recommendation"), inv.get("status"))
            inv["stage"] = stage_of(inv.get("recommendation"), inv.get("status"))

        interviewed_count = len(interviews)
        selected_count = sum(1 for i in interviews if i["verdict"] == "Selected")
        rejected_count = sum(1 for i in interviews if i["verdict"] == "Rejected")
        offers_count = sum(1 for i in interviews if i["stage"] in ("Offer", "Hired"))
        hired_count = sum(1 for i in interviews if i["stage"] == "Hired")

        stats = [
            {"label": "Resumes Added", "value": str(len(upload_days)), "change": f"{total_resumes} in total", "color": "text-emerald-400"},
            {"label": "Interviews", "value": str(interviewed_count), "change": "", "color": "text-emerald-400"},
            {"label": "Selected", "value": str(selected_count), "change": "", "color": "text-emerald-400"},
            {"label": "At Offer", "value": str(offers_count), "change": "", "color": "text-emerald-400"},
            {"label": "Hired", "value": str(hired_count), "change": "", "color": "text-emerald-400"},
        ]

        # 2. Resume Source Data
        source_pipeline = [
            {"$match": {"$or": [{"redirect_id": None}, {"redirect_id": {"$exists": False}}]}},
            {"$group": {"_id": "$resume_source", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}}
        ]
        source_cursor = resumes_coll.aggregate(source_pipeline)
        sources = await source_cursor.to_list(length=10)
        
        colors = ["#2563eb", "#06b6d4", "#f97316", "#eab308", "#10b981", "#8b5cf6", "#ec4899"]
        resumeSourceData = []
        for i, s in enumerate(sources):
            src_name = s["_id"] if s["_id"] else "Others"
            pct = f"{round((s['count'] / total_resumes) * 100)}%" if total_resumes > 0 else "0%"
            resumeSourceData.append({
                "name": src_name.title(),
                "percentage": pct,
                "count": s["count"],
                "color": colors[i % len(colors)]
            })

        # 3. Weekly trend from real dates (last 12 weeks at most)
        weeks: List[str] = []
        first_day = start or (today - timedelta(weeks=11)).isoformat()
        cursor_week = _week_start(max(first_day, (today - timedelta(weeks=11)).isoformat()))
        while cursor_week <= end:
            weeks.append(cursor_week)
            cursor_week = (datetime.strptime(cursor_week, "%Y-%m-%d").date() + timedelta(days=7)).isoformat()
        buckets = {w: {"Resumes": 0, "Interviews": 0, "Selected": 0, "Offers": 0} for w in weeks}
        for d in upload_days:
            if _week_start(d) in buckets:
                buckets[_week_start(d)]["Resumes"] += 1
        for inv in interviews:
            w = _week_start(inv["scheduled_date"]) if inv.get("scheduled_date") else ""
            if w in buckets:
                buckets[w]["Interviews"] += 1
                buckets[w]["Selected"] += inv["verdict"] == "Selected"
                buckets[w]["Offers"] += inv["stage"] in ("Offer", "Hired")
        pipelineTrendData = [
            {"date": datetime.strptime(w, "%Y-%m-%d").strftime("%d %b"), **{k: int(v) for k, v in buckets[w].items()}}
            for w in weeks
        ]

        # 4. Top Skills
        skills_pipeline = [
            {"$match": {"$or": [{"redirect_id": None}, {"redirect_id": {"$exists": False}}]}},
            {"$unwind": "$parsed_data.primary_skills"},
            {"$group": {"_id": "$parsed_data.primary_skills", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": 5}
        ]
        skills_cursor = resumes_coll.aggregate(skills_pipeline)
        top_skills_db = await skills_cursor.to_list(length=5)
        
        topSkills = []
        max_skill_count = top_skills_db[0]["count"] if top_skills_db else 1
        for s in top_skills_db:
            width_pct = round((s["count"] / max_skill_count) * 100)
            topSkills.append({
                "name": str(s["_id"]).title(),
                "count": s["count"],
                "width": f"w-[{width_pct}%]"
            })

        # 5. Exp Distribution
        exp_pipeline = [
            {"$match": {"$or": [{"redirect_id": None}, {"redirect_id": {"$exists": False}}]}},
            {"$project": {
                "exp_bucket": {
                    "$switch": {
                        "branches": [
                            {"case": {"$lt": ["$parsed_data.total_experience_years", 2]}, "then": "0-2 Yrs"},
                            {"case": {"$lt": ["$parsed_data.total_experience_years", 5]}, "then": "2-5 Yrs"},
                            {"case": {"$lt": ["$parsed_data.total_experience_years", 8]}, "then": "5-8 Yrs"},
                        ],
                        "default": "8+ Yrs"
                    }
                }
            }},
            {"$group": {"_id": "$exp_bucket", "count": {"$sum": 1}}}
        ]
        exp_cursor = resumes_coll.aggregate(exp_pipeline)
        exp_db = await exp_cursor.to_list(length=4)
        
        exp_colors = {"0-2 Yrs": "#2563eb", "2-5 Yrs": "#06b6d4", "5-8 Yrs": "#10b981", "8+ Yrs": "#f59e0b"}
        expDistribution = []
        for e in exp_db:
            pct = f"{round((e['count'] / total_resumes) * 100)}%" if total_resumes > 0 else "0%"
            expDistribution.append({
                "name": e["_id"] if e["_id"] else "Unknown",
                "percentage": pct,
                "count": e["count"],
                "color": exp_colors.get(e["_id"], "#64748b")
            })

        # 6. Success rate: share of decided interviews that ended Selected
        decided = selected_count + rejected_count
        success_rate = round((selected_count / decided) * 100) if decided > 0 else 0

        return {
            "stats": stats,
            "resumeSourceData": resumeSourceData,
            "pipelineTrendData": pipelineTrendData,
            "topSkills": topSkills,
            "expDistribution": expDistribution,
            "successRate": success_rate
        }
