import { useState, useRef } from "react";
import { Mic, Square, Loader2, Play } from "lucide-react";

export default function InterviewRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    try {
      setError("");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        await sendAudioToBackend(audioBlob);
        
        // Stop all tracks
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      setError("Microphone access denied or not available.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsProcessing(true);
    }
  };

  const sendAudioToBackend = async (blob: Blob) => {
    try {
      const formData = new FormData();
      formData.append("file", blob, "recording.webm");

      // Replace with your actual API endpoint or base URL configuration
      const response = await fetch("http://localhost:8000/api/transcription/transcribe", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.statusText}`);
      }

      const data = await response.json();
      if (data.transcription) {
        setTranscript(data.transcription);
      } else {
        setTranscript("No transcription available.");
      }
    } catch (err) {
      console.error("Transcription error:", err);
      setError("Failed to process the recording. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="bg-[#030514] p-6 rounded-2xl border border-slate-800 shadow-sm space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
          <Mic size={18} className={isRecording ? "text-red-500 animate-pulse" : "text-slate-400"} />
          Live Recording
        </h3>
        {isRecording && (
          <div className="flex items-center gap-2 text-xs font-bold text-red-500 animate-pulse">
            <span className="w-2 h-2 rounded-full bg-red-500"></span> Recording
          </div>
        )}
      </div>

      <div className="flex gap-4">
        {!isRecording ? (
          <button
            onClick={startRecording}
            disabled={isProcessing}
            className="flex flex-1 items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl text-xs font-bold transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Play size={16} /> Start Recording
          </button>
        ) : (
          <button
            onClick={stopRecording}
            className="flex flex-1 items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-xl text-xs font-bold transition-colors shadow-sm"
          >
            <Square size={16} /> Stop Recording
          </button>
        )}
      </div>

      {error && (
        <div className="p-3 bg-red-950/40 border border-red-900 text-red-400 text-xs rounded-xl font-medium">
          {error}
        </div>
      )}

      {isProcessing && (
        <div className="flex flex-col items-center justify-center gap-3 py-6">
          <Loader2 size={24} className="text-blue-500 animate-spin" />
          <p className="text-xs text-slate-400 font-medium">Processing transcription with AI...</p>
        </div>
      )}

      {transcript && !isProcessing && (
        <div className="space-y-2 pt-4 border-t border-slate-800">
          <h4 className="text-[11px] font-semibold text-slate-400 block mb-1">Transcript</h4>
          <div className="p-4 rounded-xl border border-slate-800 bg-[#070b1f] text-xs text-slate-300 leading-relaxed max-h-48 overflow-y-auto">
            {transcript}
          </div>
        </div>
      )}
    </div>
  );
}
