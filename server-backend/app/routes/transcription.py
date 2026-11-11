from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, status, Body
from app.controllers.transcription_controller import TranscriptionController
from app.core.config import settings

from app.core.dependencies import get_current_active_user

# Logged-in users only. Moved under /api/v1 like every other router (the
# Interview Questions panel already called /api/v1/transcription and got a 404).
router = APIRouter(
    prefix="/api/v1/transcription",
    tags=["Transcription"],
    dependencies=[Depends(get_current_active_user)],
)

@router.post("/transcribe", summary="Transcribe Audio")
async def transcribe_audio(file: UploadFile = File(...)):
    """
    Accepts an audio file and returns its transcription.
    """
    if not file.content_type.startswith("audio/") and not file.content_type.startswith("video/"):
        # Browsers might send webm or other types that are audio/video. 
        # We'll allow processing and let Whisper fail if it's invalid.
        pass

    try:
        transcription = await TranscriptionController.transcribe_audio(file)
        return {"status": "success", "transcription": transcription}
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An error occurred during transcription: {str(e)}"
        )

@router.post("/evaluate-answer", summary="Evaluate Answer")
async def evaluate_answer(
    transcript: str = Body(...),
    expected_answer: str = Body(...),
    question: str = Body(...),
    evaluation_criteria: str = Body(...)
):
    try:
        import httpx
        from app.repositories.settings_repository import SettingsRepository
        from app.utils.encryption import decrypt_password
        
        settings_repo = SettingsRepository()
        ai_config = await settings_repo.get_ai_config()
        
        config_payload = {}
        if ai_config:
            decrypted_key = decrypt_password(ai_config.api_key) if ai_config.api_key else ""
            config_payload = {
                "provider": ai_config.provider,
                "model_name": ai_config.model_name,
                "api_key": decrypted_key,
                "base_url": ai_config.base_url
            }

        ai_parser_base = settings.AI_PARSER_URL.replace("/api/upload", "")
        generate_url = f"{ai_parser_base}/api/evaluate-answer"
        
        async with httpx.AsyncClient(timeout=120.0) as client:
            payload = {
                "transcript": transcript,
                "expected_answer": expected_answer,
                "question": question,
                "evaluation_criteria": evaluation_criteria,
                "ai_config": config_payload
            }
            response = await client.post(generate_url, json=payload)
            response.raise_for_status()
            ai_result = response.json()
            
        if ai_result.get("status") == "success":
            return {"status": "success", "data": ai_result.get("data", {})}
        else:
            raise ValueError("AI Parser failed to evaluate answer.")
            
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An error occurred during evaluation: {str(e)}"
        )
