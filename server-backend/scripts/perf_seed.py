"""
Phase 12 performance seed: N companies x M candidates (with resumes, applications, interviews, jobs,
users and audit entries) in a LOCAL MongoDB database, for scripts/perf_measure.py.

    python -m scripts.perf_seed --db hirelogics_perf --companies 50 --candidates 2000

Refuses any database that isn't on localhost, and refuses to write into a database that already has data.
"""

import argparse
import asyncio
import random
import sys
from datetime import datetime, timedelta, timezone

from motor.motor_asyncio import AsyncIOMotorClient

SKILLS = ["Java", "Python", "React", "Node.js", "SQL", "AWS", "Docker", "Kubernetes", "Spring Boot", "Go",
          "TypeScript", "Selenium", "Django", "FastAPI", "MongoDB", "Kafka", "Azure", "Figma", "C#", "Angular"]
CITIES = ["Chennai", "Bengaluru", "Pune", "Hyderabad", "Coimbatore", "Mumbai", "Delhi", "Kochi"]
STAGES = ["applied", "screening", "shortlisted", "interview", "selected", "hired", "rejected"]


def iso(dt: datetime) -> str:
    return dt.isoformat()


def company_docs(ci: int, n_candidates: int, rng: random.Random, now: datetime):
    cid = f"perf-co-{ci:03d}"
    company = {"id": cid, "name": f"Perf Company {ci}", "slug": f"perf-{ci}", "is_active": True, "plan": "enterprise",
               "created_at": iso(now - timedelta(days=400))}
    users = [{"id": f"{cid}-u{u}", "company_id": cid, "email": f"user{u}@perf{ci}.example.com",
              "full_name": f"User {u}", "role": "admin" if u == 0 else rng.choice(["recruiter", "hiring_manager", "interviewer"]),
              "is_active": True, "is_deleted": False, "hashed_password": "x",
              "created_at": iso(now - timedelta(days=300)), "updated_at": iso(now)} for u in range(10)]
    jobs = []
    for j in range(20):
        prim = rng.sample(SKILLS, 3)
        jobs.append({"id": f"{cid}-j{j}", "company_id": cid, "code": f"JOB-{j:04d}", "title": f"Role {j}",
                     "department": rng.choice(["Engineering", "QA", "Design", "Data"]), "location": rng.choice(CITIES),
                     "status": "OPEN" if j < 15 else "CLOSED", "primary_skills": prim, "secondary_skills": rng.sample(SKILLS, 2),
                     "required_skills": prim, "open_positions": rng.randint(1, 5), "status_history": [],
                     "description": "Build things.", "created_at": iso(now - timedelta(days=200 - j)),
                     "updated_at": iso(now), "published_at": iso(now - timedelta(days=190 - j))})
    candidates, resumes, documents, apps, interviews, skills = [], [], [], [], [], []
    for k in range(n_candidates):
        cand_id = f"{cid}-c{k}"
        res_id = f"{cid}-r{k}"
        email = f"cand{k}@perf{ci}.example.com"
        when = now - timedelta(days=rng.randint(0, 365), minutes=rng.randint(0, 1440))
        cand_skills = rng.sample(SKILLS, 5)
        candidates.append({"id": cand_id, "company_id": cid, "full_name": f"Candidate {k}", "email": email,
                           "normalized_email": email, "normalized_phone": f"9{k:09d}", "phones": [f"9{k:09d}"],
                           "emails": [email], "candidate_id_display": f"CND{k:05d}", "current_role": "Engineer",
                           "total_experience_years": rng.randint(0, 15), "location": rng.choice(CITIES), "tags": [],
                           "notes": [], "status": "active", "source": rng.choice(["Careers page", "Upload", "Referral"]),
                           "created_at": iso(when), "updated_at": iso(when)})
        resumes.append({"id": res_id, "company_id": cid, "candidate_id": f"CND{k:05d}", "candidate_ref": cand_id,
                        "user_id": f"{cid}-u0", "original_filename": f"cand{k}.pdf", "filename": f"cand{k}.pdf",
                        "file_path": f"/tmp/perf/{res_id}.pdf", "status": "PARSED", "upload_date": iso(when),
                        "uploaded_by_email": f"user0@perf{ci}.example.com", "category": rng.choice(["Tech", "Non-tech"]),
                        "parsed_data": {"full_name": f"Candidate {k}", "email": email, "phone": f"9{k:09d}",
                                        "primary_skills": cand_skills[:3], "secondary_skills": cand_skills[3:],
                                        "total_experience": rng.randint(0, 15), "location": rng.choice(CITIES)},
                        "created_at": iso(when), "updated_at": iso(when)})
        documents.append({"id": res_id, "company_id": cid, "candidate_id": cand_id, "status": "PARSED", "created_at": iso(when)})
        for s in cand_skills:
            skills.append({"id": f"{cand_id}-{s}", "company_id": cid, "candidate_id": cand_id, "skill_name": s,
                           "proficiency": round(rng.uniform(1, 5), 1), "skill_class": "primary", "updated_at": iso(when)})
        if k % 4 != 3:                                      # 3 in 4 candidates applied to a job
            job = rng.choice(jobs)
            stage = rng.choice(STAGES)
            apps.append({"id": f"{cid}-a{k}", "company_id": cid, "opening_id": job["id"], "opening_title": job["title"],
                         "applicant_email": email, "resume_id": res_id, "candidate_id": cand_id, "submitted_at": iso(when),
                         "stage": stage.upper(), "stage_id": stage, "stage_name": stage.title(),
                         "stage_updated_at": iso(when + timedelta(days=2)), "source": "Careers page",
                         "form": {"personal": {"full_name": f"Candidate {k}", "location": rng.choice(CITIES)},
                                  "total_experience_years": rng.randint(0, 15), "notice_period": "30 Days"},
                         "review": {"status": rng.choice(["pending", "reviewed"])}, "history": [],
                         "hired_at": iso(when + timedelta(days=30)) if stage == "hired" else None,
                         "created_at": iso(when)})
        if k % 5 == 0:
            day = (now + timedelta(days=rng.randint(-60, 30))).date().isoformat()
            interviews.append({"id": f"{cid}-i{k}", "company_id": cid, "candidate_id": cand_id, "resume_id": res_id,
                               "application_id": f"{cid}-a{k}", "candidate_name": f"Candidate {k}", "candidate_email": email,
                               "job_id": rng.choice(jobs)["id"], "job_title": "Role", "scheduled_date": day,
                               "scheduled_time": f"{rng.randint(9, 17):02d}:00", "timezone": "Asia/Kolkata",
                               "duration_minutes": 60, "status": rng.choice(["SCHEDULED", "COMPLETED", "CANCELLED"]),
                               "round_number": 1, "interviewer_id": f"{cid}-u1", "interviewer_name": "User 1",
                               "interviewers": [], "created_at": iso(now), "updated_at": iso(now)})
    audit = [{"id": f"{cid}-log{x}", "company_id": cid, "action": rng.choice(["candidate.updated", "job.published", "user.login"]),
              "entity_type": "candidate", "entity_id": f"{cid}-c{x}", "actor": {"id": f"{cid}-u0", "name": "User 0"},
              "created_at": iso(now - timedelta(minutes=x * 7))} for x in range(500)]
    return {"companies": [company], "users": users, "job_openings": jobs, "candidates": candidates, "resumes": resumes,
            "candidate_documents": documents, "job_applications": apps, "interviews": interviews,
            "candidate_skills": skills, "audit_logs": audit}


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="mongodb://localhost:27017")
    ap.add_argument("--db", default="hirelogics_perf")
    ap.add_argument("--companies", type=int, default=50)
    ap.add_argument("--candidates", type=int, default=2000)
    ap.add_argument("--seed", type=int, default=12)
    args = ap.parse_args()
    if not any(h in args.url for h in ("localhost", "127.0.0.1", "[::1]")):
        sys.exit("perf_seed only writes to a local MongoDB.")
    db = AsyncIOMotorClient(args.url)[args.db]
    if await db.list_collection_names():
        sys.exit(f"Database '{args.db}' already has data. Use a new name or drop it first.")
    rng = random.Random(args.seed)
    now = datetime.now(timezone.utc)
    totals: dict = {}
    for ci in range(args.companies):
        for coll, docs in company_docs(ci, args.candidates, rng, now).items():
            if docs:
                await db[coll].insert_many(docs, ordered=False)
                totals[coll] = totals.get(coll, 0) + len(docs)
        if ci % 10 == 9:
            print(f"  {ci + 1} companies seeded")
    print("Seeded:", ", ".join(f"{k} {v:,}" for k, v in sorted(totals.items())))


if __name__ == "__main__":
    asyncio.run(main())
