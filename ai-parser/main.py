import os
import shutil
import traceback
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks, Depends
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from sqlalchemy.orm import Session
import logging

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Load environment variables from .env file
load_dotenv()

from graph import app_graph
from database import get_db, CandidateDB

app = FastAPI(title="AI Resume Parser Service (Async)")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

def _process_resume_task(job_id: int, file_path: str, ai_config_dict: dict = None):
    # Use a new DB session for the background task
    from database import SessionLocal
    db = SessionLocal()
    
    logger.info(f"[Job {job_id}] Starting background task for file: {file_path}")
    
    try:
        initial_state = {
            "file_path": file_path,
            "raw_text": "",
            "parsed_resume": {},
            "evaluation": {},
            "status": "started",
            "error": "",
            "ai_config": ai_config_dict or {}
        }
        
        logger.info(f"[Job {job_id}] Invoking LangGraph workflow...")
        result = app_graph.invoke(initial_state)
        logger.info(f"[Job {job_id}] Graph execution finished. Final status: {result.get('status')}")
        
        candidate = db.query(CandidateDB).filter(CandidateDB.id == job_id).first()
        if candidate:
            if result.get("error"):
                logger.error(f"[Job {job_id}] Workflow returned an error: {result['error']}")
                candidate.status = "error"
                candidate.evaluation = {"error": result["error"]}
            else:
                logger.info(f"[Job {job_id}] Workflow completed successfully.")
                candidate.status = "completed"
                candidate.parsed_resume = result.get("parsed_resume", {})
                candidate.evaluation = result.get("evaluation", {})
            db.commit()
            
    except Exception as e:
        error_trace = traceback.format_exc()
        logger.error(f"[Job {job_id}] Uncaught exception during graph execution:\n{error_trace}")
        candidate = db.query(CandidateDB).filter(CandidateDB.id == job_id).first()
        if candidate:
            candidate.status = "error"
            candidate.evaluation = {"error": str(e), "traceback": error_trace}
            db.commit()
    finally:
        db.close()
        if os.path.exists(file_path):
            os.remove(file_path)


@app.post("/api/upload")
async def upload_resume(
    background_tasks: BackgroundTasks, 
    file: UploadFile = File(...), 
    ai_config: str = Form(None),
    db: Session = Depends(get_db)
):
    from fastapi import Form
    import json
    if not file.filename.endswith((".pdf", ".docx", ".doc")):
        raise HTTPException(status_code=400, detail="Only PDF and Word documents are supported.")
        
    ai_config_dict = {}
    if ai_config:
        try:
            ai_config_dict = json.loads(ai_config)
        except Exception:
            pass
            
    # We remove the strict env check because config might come from ai_config
    if not ai_config_dict and not os.environ.get("GROQ_API_KEY") and not os.environ.get("OLLAMA_BASE_URL"):
        logger.warning("No AI config provided in payload, and env vars missing. Will proceed but might fail during parsing.")

    # Create a DB record immediately
    candidate_record = CandidateDB(status="processing", full_name="Processing...")
    db.add(candidate_record)
    db.commit()
    db.refresh(candidate_record)

    # Use job_id (CandidateDB id) in the filename to prevent collisions
    file_path = os.path.join(UPLOAD_DIR, f"{candidate_record.id}_{file.filename}")
    
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        background_tasks.add_task(_process_resume_task, candidate_record.id, file_path, ai_config_dict)
        
        return {
            "message": "Resume upload accepted, processing in background.",
            "job_id": candidate_record.id,
            "status": "processing"
        }
        
    except Exception as e:
        traceback.print_exc()
        if os.path.exists(file_path):
            os.remove(file_path)
        candidate_record.status = "error"
        db.commit()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/status/{job_id}")
async def get_status(job_id: int, db: Session = Depends(get_db)):
    candidate = db.query(CandidateDB).filter(CandidateDB.id == job_id).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="Job not found")
        
    return {
        "job_id": candidate.id,
        "status": candidate.status,
        "parsed_resume": candidate.parsed_resume,
        "evaluation": candidate.evaluation
    }
