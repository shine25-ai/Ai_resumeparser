from typing import Dict, Any, List
from datetime import datetime, timezone, timedelta
from app.core.database import get_database
from app.utils.constants import RESUMES_COLLECTION, INTERVIEWS_COLLECTION, RESUME_LOGS_COLLECTION
from app.utils.enums import ResumeStatus, InterviewStatus

class DashboardService:
    async def get_dashboard_metrics(self) -> Dict[str, Any]:
        db = get_database()
        resumes_coll = db[RESUMES_COLLECTION]
        interviews_coll = db[INTERVIEWS_COLLECTION]
        logs_coll = db[RESUME_LOGS_COLLECTION]

        # 1. Stats
        total_resumes = await resumes_coll.count_documents({"$or": [{"redirect_id": None}, {"redirect_id": {"$exists": False}}]})
        
        # Resumes created today (UTC)
        today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        today_iso = today.isoformat()
        ai_parsed_today = await resumes_coll.count_documents({
            "upload_date": {"$gte": today_iso},
            "$or": [{"redirect_id": None}, {"redirect_id": {"$exists": False}}]
        })
        
        jd_matches = await logs_coll.count_documents({"action": "evaluation_generated"})
        total_interviews = await interviews_coll.count_documents({})
        total_offers = await resumes_coll.count_documents({"status": "OFFERED", "$or": [{"redirect_id": None}, {"redirect_id": {"$exists": False}}]})
        
        stats = [
            {"label": "Total Resumes", "value": str(total_resumes), "change": "", "changeColor": "text-slate-400"},
            {"label": "AI Parsed Today", "value": str(ai_parsed_today), "change": "", "changeColor": "text-slate-400"},
            {"label": "JD Matches", "value": str(jd_matches), "change": "", "changeColor": "text-slate-400"},
            {"label": "Interviews", "value": str(total_interviews), "change": "", "changeColor": "text-slate-400"},
            {"label": "Offers", "value": str(total_offers), "change": "", "changeColor": "text-slate-400"},
        ]

        # 2. Pipeline and Status Counts
        new_count = await resumes_coll.count_documents({"status": "NEW", "$or": [{"redirect_id": None}, {"redirect_id": {"$exists": False}}]})
        shortlisted_count = await resumes_coll.count_documents({"status": "SHORTLISTED", "$or": [{"redirect_id": None}, {"redirect_id": {"$exists": False}}]})
        interview_count = await resumes_coll.count_documents({"status": "INTERVIEW", "$or": [{"redirect_id": None}, {"redirect_id": {"$exists": False}}]})
        client_interview_count = await resumes_coll.count_documents({"status": "CLIENT_INTERVIEW", "$or": [{"redirect_id": None}, {"redirect_id": {"$exists": False}}]})
        offered_count = total_offers

        total_status_count = new_count + shortlisted_count + interview_count + client_interview_count + offered_count
        
        def calc_pct(count):
            return f"{round((count / total_status_count) * 100) if total_status_count > 0 else 0}%"

        pipelineData = [
            {"stage": "Resumes Uploaded", "count": str(total_resumes), "width": "100%", "bg": "bg-blue-600"},
            {"stage": "Shortlisted", "count": str(shortlisted_count), "width": calc_pct(shortlisted_count), "bg": "bg-sky-500"},
            {"stage": "Interviews", "count": str(interview_count), "width": calc_pct(interview_count), "bg": "bg-emerald-400"},
            {"stage": "Client Interviews", "count": str(client_interview_count), "width": calc_pct(client_interview_count), "bg": "bg-emerald-600"},
            {"stage": "Offers", "count": str(offered_count), "width": calc_pct(offered_count), "bg": "bg-emerald-200"},
        ]

        statusData = [
            {"name": "New", "percentage": calc_pct(new_count), "count": new_count, "color": "#2563eb"},
            {"name": "Shortlisted", "percentage": calc_pct(shortlisted_count), "count": shortlisted_count, "color": "#06b6d4"},
            {"name": "Interview", "percentage": calc_pct(interview_count), "count": interview_count, "color": "#34d399"},
            {"name": "Client Interview", "percentage": calc_pct(client_interview_count), "count": client_interview_count, "color": "#f59e0b"},
            {"name": "Offered", "percentage": calc_pct(offered_count), "count": offered_count, "color": "#64748b"},
        ]

        # 3. Recent Activities
        logs_cursor = logs_coll.find({}).sort("created_at", -1).limit(5)
        recent_logs = await logs_cursor.to_list(length=5)
        
        recentActivities = []
        for log in recent_logs:
            title = log.get("action", "Activity").replace("_", " ").title()
            icon_type = "file"
            if "eval" in title.lower():
                icon_type = "sparkles"
            elif "interview" in title.lower():
                icon_type = "video"
            elif "status" in title.lower() or "update" in title.lower():
                icon_type = "check"
                
            time_str = log.get("created_at", "")
            if time_str:
                try:
                    dt = datetime.fromisoformat(time_str.replace('Z', '+00:00'))
                    diff = datetime.now(timezone.utc) - dt
                    if diff.days > 0:
                        time_str = f"{diff.days} days ago"
                    elif diff.seconds > 3600:
                        time_str = f"{diff.seconds // 3600} hours ago"
                    elif diff.seconds > 60:
                        time_str = f"{diff.seconds // 60} mins ago"
                    else:
                        time_str = "Just now"
                except Exception:
                    pass

            details = log.get("details", "")
            if not details and log.get("email"):
                details = f"for {log.get('email')}"
            
            display_title = f"{title} - {details}".strip(" -")
            
            recentActivities.append({
                "title": display_title[:60],
                "time": time_str,
                "icon_type": icon_type,
                "bg": "bg-slate-800"
            })

        # 4. Upcoming Interviews
        now_iso = datetime.now(timezone.utc).isoformat()
        interviews_cursor = interviews_coll.find({
            "scheduled_date": {"$gte": today_iso[:10]},
            "status": InterviewStatus.SCHEDULED.value
        }).sort([("scheduled_date", 1), ("scheduled_time", 1)]).limit(5)
        upcoming_db = await interviews_cursor.to_list(length=5)
        
        upcomingInterviews = []
        for inv in upcoming_db:
            upcomingInterviews.append({
                "time": f"{inv.get('scheduled_date', '')} {inv.get('scheduled_time', '')}".strip(),
                "role": inv.get("job_title", "Interview"),
                "candidate": inv.get("candidate_name", "Unknown")
            })

        # 5. Seniority Distribution
        seniority_pipeline = [
            {"$match": {"$or": [{"redirect_id": None}, {"redirect_id": {"$exists": False}}]}},
            {"$group": {"_id": "$parsed_data.seniority", "count": {"$sum": 1}}}
        ]
        seniority_results = await resumes_coll.aggregate(seniority_pipeline).to_list(None)
        
        seniorityDistribution = []
        colors = ["#8b5cf6", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#64748b"]
        for i, s in enumerate(seniority_results):
            name = s["_id"] or "Not Specified"
            count = s["count"]
            pct = f"{round((count / total_resumes) * 100) if total_resumes > 0 else 0}%"
            seniorityDistribution.append({"name": name, "percentage": pct, "count": count, "color": colors[i % len(colors)]})
            
        # 6. Domain Distribution
        domain_pipeline = [
            {"$match": {"$or": [{"redirect_id": None}, {"redirect_id": {"$exists": False}}]}},
            {"$group": {"_id": "$parsed_data.primary_domain", "count": {"$sum": 1}}}
        ]
        domain_results = await resumes_coll.aggregate(domain_pipeline).to_list(None)
        
        domainDistribution = []
        for i, d in enumerate(domain_results):
            name = d["_id"] or "Not Specified"
            count = d["count"]
            pct = f"{round((count / total_resumes) * 100) if total_resumes > 0 else 0}%"
            domainDistribution.append({"name": name, "percentage": pct, "count": count, "color": colors[(i+2) % len(colors)]})

        return {
            "stats": stats,
            "pipelineData": pipelineData,
            "statusData": statusData,
            "recentActivities": recentActivities,
            "upcomingInterviews": upcomingInterviews,
            "seniorityDistribution": seniorityDistribution,
            "domainDistribution": domainDistribution
        }
