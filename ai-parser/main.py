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
from pydantic import BaseModel
from typing import Dict, Any, List, Optional

class GenerateQuestionsRequest(BaseModel):
    parsed_data: Dict[str, Any]
    ai_config: Optional[Dict[str, Any]] = None
    existing_questions: Optional[str] = None

class SearchPlanRequest(BaseModel):
    prompt: str
    ai_config: Optional[Dict[str, Any]] = None

class RerankRequest(BaseModel):
    prompt: Optional[str] = None
    plan: Dict[str, Any]
    candidates: list
    ai_config: Optional[Dict[str, Any]] = None

class EmbedRequest(BaseModel):
    texts: List[str]
    kind: str = "passage"

class EvaluateAnswerRequest(BaseModel):
    transcript: str
    expected_answer: str
    question: str
    evaluation_criteria: str
    ai_config: Optional[Dict[str, Any]] = None

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

# Only a few resumes are parsed at once (gap G04): the rest wait as "queued" instead of all hitting the
# LLM provider together and running into its per-minute limits.
from concurrent.futures import ThreadPoolExecutor
MAX_CONCURRENT_JOBS = int(os.getenv("PARSER_MAX_CONCURRENT_JOBS", "2"))
_job_pool = ThreadPoolExecutor(max_workers=MAX_CONCURRENT_JOBS, thread_name_prefix="parse-job")


@app.on_event("startup")
def fail_interrupted_jobs():
    """Jobs still queued/processing at startup were cut off by a restart (gap G05): mark them failed
    so nothing waits on them forever."""
    from database import SessionLocal
    db = SessionLocal()
    try:
        stuck = db.query(CandidateDB).filter(CandidateDB.status.in_(["processing", "queued"])).all()
        for c in stuck:
            c.status = "error"
            c.evaluation = {"error": "Parsing was interrupted because the parser service restarted. Please upload the resume again."}
        db.commit()
        if stuck:
            logger.warning(f"Marked {len(stuck)} interrupted job(s) as failed: {[c.id for c in stuck]}")
        for name in os.listdir(UPLOAD_DIR):  # their files will never be processed
            if name.split("_", 1)[0] in {str(c.id) for c in stuck}:
                os.remove(os.path.join(UPLOAD_DIR, name))
    finally:
        db.close()

def _process_resume_task(job_id: int, file_path: str, ai_config_dict: dict = None):
    # Use a new DB session for the background task
    from database import SessionLocal
    db = SessionLocal()

    logger.info(f"[Job {job_id}] Starting background task for file: {file_path}")

    try:
        candidate = db.query(CandidateDB).filter(CandidateDB.id == job_id).first()
        if candidate:
            candidate.status = "processing"
            db.commit()
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
                # The text the AI read is handed back so the backend can search the same text (gap G13).
                candidate.evaluation = {**result.get("evaluation", {}), "_resume_text": result.get("raw_text", "")}
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
    candidate_record = CandidateDB(status="queued", full_name="Processing...")
    db.add(candidate_record)
    db.commit()
    db.refresh(candidate_record)

    # Use job_id (CandidateDB id) in the filename to prevent collisions
    file_path = os.path.join(UPLOAD_DIR, f"{candidate_record.id}_{file.filename}")
    
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        _job_pool.submit(_process_resume_task, candidate_record.id, file_path, ai_config_dict)
        
        return {
            "message": "Resume upload accepted, processing in background.",
            "job_id": candidate_record.id,
            "status": "queued"
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
        
    evaluation = dict(candidate.evaluation or {})
    resume_text = evaluation.pop("_resume_text", None)
    return {
        "job_id": candidate.id,
        "status": candidate.status,
        "parsed_resume": candidate.parsed_resume,
        "evaluation": evaluation,
        "resume_text": resume_text,
    }

@app.post("/api/generate-questions")
async def generate_questions(request: GenerateQuestionsRequest):
    try:
        from graph import get_llm
        from langchain_core.prompts import ChatPromptTemplate
        import json
        
        llm = get_llm(request.ai_config)
        prompt = ChatPromptTemplate.from_messages([
            ("system", "You are an expert interviewer. Generate interview questions specifically for this shortlisted candidate.\n\n"
                       "IMPORTANT: The questions must be crisp and concise. The expected answers must also be crisp and provided in concise bullet points. "
                       "Additionally, ensure the questions consider and assess the candidate's general interview skills and communication ability.\n"
                       "If 'round_specific_skills_to_assess' or 'round_specific_categories_to_assess' are provided in the candidate data, prioritize generating technical, behavioral, and domain questions that exactly assess those required skills and weighted categories for this interview round.\n\n"
                       "If 'existing_questions' is provided by the user, DO NOT repeat or generate similar questions to the ones listed there. You MUST generate entirely NEW questions.\n\n"
                       "You must output JSON with the following structure:\n"
                       "{{\n"
                       "  \"technical\": [{{ \"question\": \"...\", \"expectedAnswer\": \"...\", \"evaluationCriteria\": \"...\" }}],\n"
                       "  \"behavioral\": [{{ \"question\": \"...\", \"expectedAnswer\": \"...\", \"evaluationCriteria\": \"...\" }}],\n"
                       "  \"domain\": [{{ \"question\": \"...\", \"expectedAnswer\": \"...\", \"evaluationCriteria\": \"...\" }}]\n"
                       "}}\n\n"
                       "Return ONLY valid JSON matching this structure without Markdown blocks."),
            ("user", "Candidate Resume Data:\n{parsed_data}\n\nExisting Questions to avoid:\n{existing_questions}")
        ])
        
        prompt_val = prompt.invoke({
            "parsed_data": json.dumps(request.parsed_data),
            "existing_questions": request.existing_questions or "None"
        })
        ai_msg = llm.invoke(prompt_val)
        
        response_content = ai_msg.content
        if response_content.startswith("```json"):
            response_content = response_content.replace("```json", "", 1).replace("```", "").strip()
        elif response_content.startswith("```"):
            response_content = response_content.replace("```", "", 2).strip()
            
        questions_json = json.loads(response_content)
        return {"status": "success", "data": questions_json}
    except Exception as e:
        logger.error(f"Error generating questions: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/search-plan")
def search_plan_endpoint(request: SearchPlanRequest):
    """JD Match prompt mode: a recruiter's request or job description -> search filters."""
    from search_plan import build_search_plan
    if not request.prompt or not request.prompt.strip():
        raise HTTPException(status_code=400, detail="Describe the role or paste a job description.")
    try:
        plan, usage = build_search_plan(request.prompt, request.ai_config)
    except Exception as e:
        logger.error(f"Search plan failed: {str(e)[:300]}")
        status = 429 if "rate limit" in str(e).lower() else 502
        raise HTTPException(status_code=status, detail=f"Could not read the request: {str(e)[:300]}")
    return {"status": "success", "plan": plan, "token_usage": usage}

@app.post("/api/rerank")
def rerank_endpoint(request: RerankRequest):
    """JD Match prompt mode, phase 2: the AI scores the top candidates against the request and says why."""
    from rerank import rerank_candidates, MAX_CANDIDATES
    if not request.candidates:
        return {"status": "success", "results": [], "token_usage": {}}
    if len(request.candidates) > MAX_CANDIDATES:
        raise HTTPException(status_code=400, detail=f"Send at most {MAX_CANDIDATES} candidates.")
    try:
        results, usage = rerank_candidates(request.prompt or "", request.plan, request.candidates, request.ai_config)
    except Exception as e:
        logger.error(f"Rerank failed: {str(e)[:300]}")
        status = 429 if "rate limit" in str(e).lower() else 502
        raise HTTPException(status_code=status, detail=f"Could not rank candidates: {str(e)[:300]}")
    return {"status": "success", "results": results, "token_usage": usage}

@app.on_event("startup")
def warm_up_embedding_model():
    """Load the meaning model in the background so the first search after a restart is not slow."""
    import threading
    def load():
        try:
            from embeddings import embed
            embed(["warm up"], "query")
            logger.info("Embedding model loaded.")
        except Exception as e:
            logger.error(f"Embedding model could not be loaded: {str(e)[:300]}")
    threading.Thread(target=load, daemon=True, name="embedding-warm-up").start()

@app.post("/api/embed")
def embed_endpoint(request: EmbedRequest):
    """JD Match prompt mode, phase 3: meaning vectors for resumes ("passage") or a search request ("query")."""
    from embeddings import embed, MODEL_NAME
    try:
        vectors = embed(request.texts, request.kind)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Embedding failed: {str(e)[:300]}")
        raise HTTPException(status_code=502, detail=f"Could not embed the text: {str(e)[:300]}")
    return {"status": "success", "model": MODEL_NAME, "dim": len(vectors[0]) if vectors else 0, "vectors": vectors}

@app.post("/api/evaluate-answer")
async def evaluate_answer(request: EvaluateAnswerRequest):
    try:
        from graph import get_llm
        from langchain_core.prompts import ChatPromptTemplate
        import json
        
        llm = get_llm(request.ai_config)
        prompt = ChatPromptTemplate.from_messages([
            ("system", "You are an expert interviewer evaluating a candidate's verbal response.\n\n"
                       "You will be given the original question, the expected answer, the evaluation criteria, and the actual transcript of the candidate's answer.\n"
                       "Your job is to compare the transcript to the expected answer and criteria.\n"
                       "You must output JSON with the following structure:\n"
                       "{{\n"
                       "  \"score\": 0-100,\n"
                       "  \"feedback\": \"detailed feedback explaining what they did well and what they missed based on the expected answer\",\n"
                       "  \"is_match\": true/false (true if score > 60)\n"
                       "}}\n\n"
                       "Return ONLY valid JSON matching this structure without Markdown blocks."),
            ("user", "Question: {question}\n\nExpected Answer: {expected_answer}\n\nCriteria: {criteria}\n\nCandidate Transcript:\n{transcript}")
        ])
        
        prompt_val = prompt.invoke({
            "question": request.question,
            "expected_answer": request.expected_answer,
            "criteria": request.evaluation_criteria,
            "transcript": request.transcript
        })
        ai_msg = llm.invoke(prompt_val)
        
        response_content = ai_msg.content
        if response_content.startswith("```json"):
            response_content = response_content.replace("```json", "", 1).replace("```", "").strip()
        elif response_content.startswith("```"):
            response_content = response_content.replace("```", "", 2).strip()
            
        evaluation_json = json.loads(response_content)
        return {"status": "success", "data": evaluation_json}
    except Exception as e:
        logger.error(f"Error evaluating answer: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


