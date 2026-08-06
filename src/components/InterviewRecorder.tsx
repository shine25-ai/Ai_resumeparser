import { useState, useRef } from "react";
import { Mic, Square, Loader2, Play, Video, UploadCloud } from "lucide-react";

export default function InterviewRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState("");
  const [recordMode, setRecordMode] = useState<"audio" | "video" | "upload">("audio");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);

  const startRecording = async () => {
    try {
      setError("");
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: true,
        video: recordMode === "video"
      });
      
      if (recordMode === "video" && videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        if (videoRef.current) {
          videoRef.current.srcObject = null;
        }
        const mimeType = recordMode === "video" ? "video/webm" : "audio/webm";
        const fileExt = recordMode === "video" ? "webm" : "webm";
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        await sendAudioToBackend(audioBlob, fileExt);
        
        // Stop all tracks
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error(`Error accessing ${recordMode}:`, err);
      setError(`Microphone ${recordMode === 'video' ? 'or Camera ' : ''}access denied or not available.`);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsProcessing(true);
    }
  };

  const sendAudioToBackend = async (blob: Blob, ext: string = "webm") => {
    try {
      setIsProcessing(true);
      setError("");
      
      const formData = new FormData();
      formData.append("file", blob, `recording.${ext}`);

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
      setError("Failed to process the file. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const ext = file.name.split('.').pop() || "mp4";
      sendAudioToBackend(file, ext);
    }
  };

  return (
    <div className="bg-[#030514] p-6 rounded-2xl border border-slate-800 shadow-sm space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
          {recordMode === "video" ? (
            <Video size={18} className={isRecording ? "text-red-500 animate-pulse" : "text-slate-400"} />
          ) : recordMode === "upload" ? (
            <UploadCloud size={18} className="text-slate-400" />
          ) : (
            <Mic size={18} className={isRecording ? "text-red-500 animate-pulse" : "text-slate-400"} />
          )}
          {recordMode === "upload" ? "Upload File" : "Live Recording"}
        </h3>
        {isRecording && (
          <div className="flex items-center gap-2 text-xs font-bold text-red-500 animate-pulse">
            <span className="w-2 h-2 rounded-full bg-red-500"></span> Recording
          </div>
        )}
      </div>

      {!isRecording && (
        <div className="flex gap-2 p-1 bg-slate-900 rounded-xl border border-slate-800">
          <button
            onClick={() => setRecordMode("audio")}
            className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-2 ${
              recordMode === "audio" ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-300"
            }`}
          >
            <Mic size={14} /> Audio
          </button>
          <button
            onClick={() => setRecordMode("video")}
            className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-2 ${
              recordMode === "video" ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-300"
            }`}
          >
            <Video size={14} /> Video
          </button>
          <button
            onClick={() => setRecordMode("upload")}
            className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-2 ${
              recordMode === "upload" ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-300"
            }`}
          >
            <UploadCloud size={14} /> Upload
          </button>
        </div>
      )}

      {/* Video Preview */}
      <div className={`${recordMode === "video" && isRecording ? "block" : "hidden"} rounded-xl overflow-hidden bg-black border border-slate-800 aspect-video relative`}>
        <video 
          ref={videoRef} 
          autoPlay 
          muted 
          playsInline
          className="w-full h-full object-cover transform -scale-x-100"
        />
        <div className="absolute top-4 right-4 flex items-center gap-2 text-xs font-bold text-white bg-red-500/80 px-2 py-1 rounded-md backdrop-blur-sm">
          <span className="w-2 h-2 rounded-full bg-white animate-pulse"></span> REC
        </div>
      </div>

      {recordMode === "upload" && !isProcessing && (
        <div className="border-2 border-dashed border-slate-700 hover:border-blue-500 bg-slate-900/50 rounded-xl p-8 flex flex-col items-center justify-center transition-colors cursor-pointer relative">
          <input 
            type="file" 
            accept="audio/*,video/*" 
            onChange={handleFileUpload}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          <UploadCloud size={32} className="text-slate-400 mb-3" />
          <p className="text-sm font-bold text-slate-200">Click or drag a file to upload</p>
          <p className="text-[11px] text-slate-500 mt-1">Supports MP3, WAV, MP4, WEBM</p>
        </div>
      )}

      {recordMode !== "upload" && (
        <div className="flex gap-4">
          {!isRecording ? (
            <button
              onClick={startRecording}
              disabled={isProcessing}
              className="flex flex-1 items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl text-xs font-bold transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Play size={16} /> Start {recordMode === "video" ? "Video" : "Audio"} Recording
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
      )}

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
