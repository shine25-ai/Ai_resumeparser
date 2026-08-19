import os
from typing import Dict, Any
from typing_extensions import TypedDict
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser
from langchain_community.document_loaders import PyPDFLoader
from langgraph.graph import StateGraph, END
import json

from schema import ResumeSchema, CandidateEvaluationSchema, BasicInfoSchema, WorkExperienceSchema, ProjectsSchema, EducationSchema

def get_llm(ai_config: dict = None, state: dict = None):
    ai_config = ai_config or {}
    provider = ai_config.get("provider") or os.getenv("LLM_PROVIDER", "groq").lower()
    
    if provider == "ollama":
        from langchain_ollama import ChatOllama
        base_url = ai_config.get("base_url") or os.getenv("OLLAMA_BASE_URL", "https://ai.shinelogics.com")
        model = ai_config.get("model_name") or os.getenv("OLLAMA_MODEL", "gpt-oss:120b-cloud")
        llm = ChatOllama(model=model, base_url=base_url, temperature=0, format="json")
    elif provider == "openrouter":
        from langchain_openai import ChatOpenAI
        base_url = ai_config.get("base_url") or "https://openrouter.ai/api/v1"
        model = ai_config.get("model_name") or os.getenv("OPENROUTER_MODEL", "openai/gpt-oss-120b")
        api_key = ai_config.get("api_key") or os.getenv("OPENROUTER_API_KEY", "")
        llm = ChatOpenAI(model=model, base_url=base_url, api_key=api_key, temperature=0, model_kwargs={"response_format": {"type": "json_object"}})
    else:
        from langchain_groq import ChatGroq
        import httpx
        model = ai_config.get("model_name") or os.getenv("GROQ_MODEL", "gpt-oss:120b")
        api_key = ai_config.get("api_key") or os.getenv("GROQ_API_KEY", "")
        
        custom_client = None
        if state is not None:
            def hook_response(response):
                if response.status_code == 200:
                    headers = response.headers
                    if "x-ratelimit-limit-requests" in headers:
                        limits = {
                            "limit_requests": headers.get("x-ratelimit-limit-requests"),
                            "limit_tokens": headers.get("x-ratelimit-limit-tokens"),
                            "remaining_requests": headers.get("x-ratelimit-remaining-requests"),
                            "remaining_tokens": headers.get("x-ratelimit-remaining-tokens"),
                            "reset_requests": headers.get("x-ratelimit-reset-requests"),
                            "reset_tokens": headers.get("x-ratelimit-reset-tokens"),
                        }
                        eval_data = state.setdefault("evaluation", {})
                        eval_data["rate_limits"] = limits
            custom_client = httpx.Client(event_hooks={"response": [hook_response]}, timeout=120.0)

        kwargs = {"model": model, "temperature": 0}
        if api_key:
            kwargs["api_key"] = api_key
        if custom_client:
            kwargs["http_client"] = custom_client

        llm = ChatGroq(**kwargs)
        
    return llm

class GraphState(TypedDict):
    file_path: str
    raw_text: str
    parsed_resume: Dict[str, Any]
    evaluation: Dict[str, Any]
    status: str
    error: str
    ai_config: Dict[str, Any]

def _invoke_and_accumulate(llm, parser, prompt, state: GraphState, kwargs: dict) -> dict:
    prompt_val = prompt.invoke(kwargs)
    ai_msg = llm.invoke(prompt_val)
    result = parser.invoke(ai_msg)
    
    # Accumulate usage
    usage = getattr(ai_msg, "usage_metadata", None) or {}
    if usage:
        eval_data = state.setdefault("evaluation", {})
        token_usage = eval_data.setdefault("token_usage", {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0})
        token_usage["input_tokens"] += usage.get("input_tokens", 0)
        token_usage["output_tokens"] += usage.get("output_tokens", 0)
        token_usage["total_tokens"] += usage.get("total_tokens", 0)
        
    return result

# Node 1: Extract Text
def extract_text_node(state: GraphState):
    """Extracts raw text from the provided PDF or DOCX file."""
    try:
        file_path = state["file_path"]
        ext = file_path.rsplit(".", 1)[-1].lower()
        
        if ext in ["docx", "doc"]:
            from langchain_community.document_loaders import Docx2txtLoader
            loader = Docx2txtLoader(file_path)
        else:
            loader = PyPDFLoader(file_path)
            
        pages = loader.load()
        text = "\n".join([page.page_content for page in pages])
        return {"raw_text": text, "status": "text_extracted"}
    except Exception as e:
        return {"error": str(e), "status": "failed_extraction"}

# Node 2: Parse Basic Info
def parse_basic_info_node(state: GraphState):
    if state.get("error"): return state
    try:
        llm = get_llm(state.get("ai_config"), state)
        parser = JsonOutputParser(pydantic_object=BasicInfoSchema)
        prompt = ChatPromptTemplate.from_messages([
            ("system", "Extract the candidate's basic info and skills from the resume text.\n{format_instructions}"),
            ("user", "Resume Text:\n{resume_text}")
        ])
        result = _invoke_and_accumulate(llm, parser, prompt, state, {
            "resume_text": state["raw_text"],
            "format_instructions": parser.get_format_instructions()
        })
        parsed = state.get("parsed_resume", {})
        parsed.update(result)
        return {"parsed_resume": parsed, "status": "basic_info_parsed"}
    except Exception as e:
        return {"error": f"Basic Info Parsing Error: {str(e)}", "status": "failed_parsing"}

# Node 3: Parse Work Experience
def parse_work_experience_node(state: GraphState):
    if state.get("error"): return state
    try:
        llm = get_llm(state.get("ai_config"), state)
        parser = JsonOutputParser(pydantic_object=WorkExperienceSchema)
        prompt = ChatPromptTemplate.from_messages([
            ("system", "Extract ONLY professional employment experience from the resume text.\nCRITICAL RULE: DO NOT INCLUDE PROJECTS HERE.\n{format_instructions}"),
            ("user", "Resume Text:\n{resume_text}")
        ])
        result = _invoke_and_accumulate(llm, parser, prompt, state, {
            "resume_text": state["raw_text"],
            "format_instructions": parser.get_format_instructions()
        })
        parsed = state.get("parsed_resume", {})
        parsed.update(result)
        return {"parsed_resume": parsed, "status": "experience_parsed"}
    except Exception as e:
        return {"error": f"Work Experience Parsing Error: {str(e)}", "status": "failed_parsing"}

# Node 4: Parse Projects
def parse_projects_node(state: GraphState):
    if state.get("error"): return state
    try:
        llm = get_llm(state.get("ai_config"), state)
        parser = JsonOutputParser(pydantic_object=ProjectsSchema)
        prompt = ChatPromptTemplate.from_messages([
            ("system", "Extract all personal, academic, or professional projects from the resume text.\n{format_instructions}"),
            ("user", "Resume Text:\n{resume_text}")
        ])
        result = _invoke_and_accumulate(llm, parser, prompt, state, {
            "resume_text": state["raw_text"],
            "format_instructions": parser.get_format_instructions()
        })
        parsed = state.get("parsed_resume", {})
        parsed.update(result)
        return {"parsed_resume": parsed, "status": "projects_parsed"}
    except Exception as e:
        return {"error": f"Projects Parsing Error: {str(e)}", "status": "failed_parsing"}

# Node 5: Parse Education & Certifications
def parse_education_node(state: GraphState):
    if state.get("error"): return state
    try:
        llm = get_llm(state.get("ai_config"), state)
        parser = JsonOutputParser(pydantic_object=EducationSchema)
        prompt = ChatPromptTemplate.from_messages([
            ("system", "Extract education and certifications from the resume text.\n{format_instructions}"),
            ("user", "Resume Text:\n{resume_text}")
        ])
        result = _invoke_and_accumulate(llm, parser, prompt, state, {
            "resume_text": state["raw_text"],
            "format_instructions": parser.get_format_instructions()
        })
        parsed = state.get("parsed_resume", {})
        parsed.update(result)
        return {"parsed_resume": parsed, "status": "education_parsed"}
    except Exception as e:
        return {"error": f"Education Parsing Error: {str(e)}", "status": "failed_parsing"}

# Node 6: Evaluate Candidate
def evaluate_candidate_node(state: GraphState):
    if state.get("error"): return state
    try:
        llm = get_llm(state.get("ai_config"), state)
        parser = JsonOutputParser(pydantic_object=CandidateEvaluationSchema)
        prompt = ChatPromptTemplate.from_messages([
            ("system", "You are an expert AI Technical Recruiter. Based on the parsed resume data, evaluate the candidate and provide scores, career analysis, and personality insights.\n\nDO NOT repeat the resume data. ONLY output the evaluation fields defined in the schema.\n\n{format_instructions}"),
            ("user", "Parsed Resume Data:\n{parsed_data}")
        ])
        result = _invoke_and_accumulate(llm, parser, prompt, state, {
            "parsed_data": json.dumps(state["parsed_resume"]),
            "format_instructions": parser.get_format_instructions()
        })
        # Merge evaluation but preserve token_usage if any
        eval_data = state.get("evaluation", {})
        token_usage = eval_data.get("token_usage")
        eval_data.update(result)
        
        # Add AI Metadata
        ai_config = state.get("ai_config") or {}
        provider = ai_config.get("provider") or os.getenv("LLM_PROVIDER", "groq").lower()
        if provider == "ollama":
            model = ai_config.get("model_name") or os.getenv("OLLAMA_MODEL", "gpt-oss:120b-cloud")
        elif provider == "openrouter":
            model = ai_config.get("model_name") or os.getenv("OPENROUTER_MODEL", "openai/gpt-oss-120b")
        else:
            model = ai_config.get("model_name") or os.getenv("GROQ_MODEL", "gpt-oss:120b")
        eval_data["ai_metadata"] = {"provider": provider, "model": model}
        
        if token_usage:
            eval_data["token_usage"] = token_usage
        return {"evaluation": eval_data, "status": "candidate_evaluated"}
    except Exception as e:
        return {"error": str(e), "status": "failed_evaluation"}

# Single Node: Parse Entire Resume (Alternative to Nodes 2-5)
def parse_entire_resume_node(state: GraphState):
    if state.get("error"): return state
    try:
        llm = get_llm(state.get("ai_config"), state)
        parser = JsonOutputParser(pydantic_object=ResumeSchema)
        prompt = ChatPromptTemplate.from_messages([
            ("system", "Extract all candidate information from the resume text into the required format. Ensure all sections are properly populated.\n{format_instructions}"),
            ("user", "Resume Text:\n{resume_text}")
        ])
        result = _invoke_and_accumulate(llm, parser, prompt, state, {
            "resume_text": state["raw_text"],
            "format_instructions": parser.get_format_instructions()
        })
        parsed = state.get("parsed_resume", {})
        parsed.update(result)
        return {"parsed_resume": parsed, "status": "resume_parsed"}
    except Exception as e:
        return {"error": f"Single Parse Error: {str(e)}", "status": "failed_parsing"}

def build_resume_parser_graph():
    workflow = StateGraph(GraphState)
    
    workflow.add_node("extract_text", extract_text_node)
    
    # Multi-step nodes
    workflow.add_node("parse_basic_info", parse_basic_info_node)
    workflow.add_node("parse_work_experience", parse_work_experience_node)
    workflow.add_node("parse_projects", parse_projects_node)
    workflow.add_node("parse_education", parse_education_node)
    
    # Single-step node
    workflow.add_node("parse_entire_resume", parse_entire_resume_node)
    
    workflow.add_node("evaluate_candidate", evaluate_candidate_node)
    
    workflow.set_entry_point("extract_text")
    
    def check_error_and_route_extract(state: GraphState):
        if state.get("error"): return "end"
        mode = os.getenv("PARSE_MODE", "multi").lower()
        if mode == "single":
            return "single_parse"
        return "multi_parse"
        
    def check_error(state: GraphState):
        if state.get("error"): return "end"
        return "continue"
        
    workflow.add_conditional_edges("extract_text", check_error_and_route_extract, {
        "multi_parse": "parse_basic_info",
        "single_parse": "parse_entire_resume",
        "end": END
    })
    
    # Multi-step edges
    workflow.add_conditional_edges("parse_basic_info", check_error, {"continue": "parse_work_experience", "end": END})
    workflow.add_conditional_edges("parse_work_experience", check_error, {"continue": "parse_projects", "end": END})
    workflow.add_conditional_edges("parse_projects", check_error, {"continue": "parse_education", "end": END})
    workflow.add_conditional_edges("parse_education", check_error, {"continue": "evaluate_candidate", "end": END})
    
    # Single-step edges
    workflow.add_conditional_edges("parse_entire_resume", check_error, {"continue": "evaluate_candidate", "end": END})
    
    workflow.add_edge("evaluate_candidate", END)
    
    return workflow.compile()

app_graph = build_resume_parser_graph()
