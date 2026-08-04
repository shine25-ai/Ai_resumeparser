import os
import tempfile
from fastapi import UploadFile, HTTPException, status
from faster_whisper import WhisperModel

# Initialize the faster-whisper model
try:
    # "base" model provides a good balance between speed and accuracy
    model = WhisperModel("base", device="cpu", compute_type="int8")
except Exception as e:
    print(f"Error initializing WhisperModel: {e}")
    model = None

class TranscriptionController:
    @staticmethod
    async def transcribe_audio(file: UploadFile) -> str:
        """
        Transcribes the uploaded audio file using faster-whisper.
        """
        if model is None:
            raise HTTPException(status_code=500, detail="Transcription model is not initialized.")

        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix=".m4a") as tmp_file:
                content = await file.read()
                tmp_file.write(content)
                tmp_file_path = tmp_file.name
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to save uploaded file: {e}"
            )

        try:
            # Transcribe the audio forcing English language
            segments, info = model.transcribe(tmp_file_path, beam_size=5, language="en", condition_on_previous_text=False)
            transcription = " ".join([segment.text for segment in segments])
            return transcription.strip()
            
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Transcription failed: {e}"
            )
        finally:
            # Clean up the temporary file
            if os.path.exists(tmp_file_path):
                os.remove(tmp_file_path)
