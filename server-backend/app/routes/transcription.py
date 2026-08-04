from fastapi import APIRouter, UploadFile, File, HTTPException, status
from app.controllers.transcription_controller import TranscriptionController

router = APIRouter(
    prefix="/api/transcription",
    tags=["Transcription"],
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
