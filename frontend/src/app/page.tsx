"use client";

import React, { useState, useEffect, useRef } from "react";
import { 
  Download, 
  Sparkles, 
  Play, 
  Music, 
  Video, 
  AlertCircle, 
  CheckCircle2, 
  Loader2, 
  Clipboard, 
  ArrowRight,
  Clock,
  Eye,
  User,
  ShieldCheck,
  RefreshCw
} from "lucide-react";

interface MediaOption {
  quality: string;
  height?: number;
  format: string;
  label: string;
  type: "video" | "audio";
}

interface VideoData {
  id: string;
  url: string;
  title: string;
  thumbnail: string;
  duration_formatted?: string;
  uploader?: string;
  view_count?: number;
  is_short: boolean;
  options: MediaOption[];
}

interface JobStatus {
  job_id: string;
  status: "queued" | "processing" | "completed" | "failed" | "cancelled";
  progress: number;
  speed: string;
  eta: string;
  filename: string;
  file_size: number;
  error?: string;
}

const BACKEND_URL = "http://127.0.0.1:8000/api/v1";

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [videoData, setVideoData] = useState<VideoData | null>(null);
  
  // Selection state
  const [selectedOption, setSelectedOption] = useState<MediaOption | null>(null);

  // Job & Progress state
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [downloading, setDownloading] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Clean up SSE on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrl(text);
        setError(null);
      }
    } catch {
      setError("Please allow clipboard permission or paste manually.");
    }
  };

  const handleInspect = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!url.trim()) {
      setError("Please paste a valid YouTube video or Shorts link.");
      return;
    }

    setLoading(true);
    setError(null);
    setVideoData(null);
    setJobStatus(null);
    setActiveJobId(null);

    try {
      const res = await fetch(`${BACKEND_URL}/inspect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.detail || "Failed to inspect video.");
      }

      setVideoData(json.data);
      if (json.data.options && json.data.options.length > 0) {
        setSelectedOption(json.data.options[0]);
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Network error: Make sure backend server is running.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleStartDownload = async () => {
    if (!videoData || !selectedOption) return;

    setDownloading(true);
    setError(null);

    try {
      const res = await fetch(`${BACKEND_URL}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: videoData.url,
          format: selectedOption.type,
          quality: selectedOption.quality,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.detail || "Failed to initialize download job.");
      }

      const jobId = json.job_id;
      setActiveJobId(jobId);

      // Listen to SSE events for progress
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      const sse = new EventSource(`${BACKEND_URL}/jobs/${jobId}/events`);
      eventSourceRef.current = sse;

      sse.onmessage = (event) => {
        try {
          const data: JobStatus = JSON.parse(event.data);
          setJobStatus(data);

          if (data.status === "completed") {
            setDownloading(false);
            sse.close();
          } else if (data.status === "failed") {
            setDownloading(false);
            setError(data.error || "Download processing failed.");
            sse.close();
          }
        } catch {
          // heartbeat or non-json message
        }
      };

      sse.onerror = () => {
        // SSE disconnected or complete
        sse.close();
      };
    } catch (err: unknown) {
      setDownloading(false);
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to start download job.");
      }
    }
  };

  const formatViews = (views?: number) => {
    if (!views) return null;
    if (views >= 1_000_000) return `${(views / 1_000_000).toFixed(1)}M views`;
    if (views >= 1_000) return `${(views / 1_000).toFixed(1)}K views`;
    return `${views} views`;
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return "";
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  return (
    <main className="min-h-screen bg-[#0d0f15] text-slate-100 flex flex-col justify-between selection:bg-rose-500 selection:text-white">
      {/* Top Navbar */}
      <header className="border-b border-slate-800/80 bg-[#12151f]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-rose-600 to-red-500 flex items-center justify-center shadow-lg shadow-red-500/20">
              <Download className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="font-bold text-lg tracking-tight text-white flex items-center gap-1.5">
                TubeFetch <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-rose-400 border border-rose-500/20 font-medium">PRO</span>
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
            Server Ready &bull; Fast Engine
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="max-w-4xl mx-auto px-4 py-12 w-full flex-1">
        {/* Hero Section */}
        <div className="text-center space-y-3 mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700/60 text-xs text-slate-300">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            Supports YouTube Videos & Shorts in 1080p, 720p, 480p & MP3
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white">
            YouTube Video &amp; Shorts <br className="hidden sm:inline" />
            <span className="bg-gradient-to-r from-red-500 via-rose-500 to-amber-500 bg-clip-text text-transparent">
              High Quality Downloader
            </span>
          </h1>
          <p className="text-sm sm:text-base text-slate-400 max-w-xl mx-auto">
            Paste any YouTube video or Shorts link below to fetch real video resolutions, convert to MP3, and download directly.
          </p>
        </div>

        {/* Input Card */}
        <div className="bg-[#151824] border border-slate-800/80 rounded-2xl p-3 sm:p-4 shadow-2xl relative">
          <form onSubmit={handleInspect} className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Paste YouTube or Shorts URL here (e.g. https://youtu.be/...)"
                className="w-full bg-[#0d0f15] border border-slate-700/80 rounded-xl px-4 py-3.5 pl-4 pr-24 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-all"
              />
              <button
                type="button"
                onClick={handlePaste}
                className="absolute right-2 top-1/2 -translate-y-1/2 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 font-medium flex items-center gap-1.5 transition-colors border border-slate-700/50"
              >
                <Clipboard className="w-3.5 h-3.5" />
                Paste
              </button>
            </div>
            <button
              type="submit"
              disabled={loading || !url.trim()}
              className="px-6 py-3.5 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold flex items-center justify-center gap-2 shadow-lg shadow-red-600/25 transition-all"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  Fetch Video
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Error Banner */}
          {error && (
            <div className="mt-4 p-3.5 rounded-xl bg-red-950/40 border border-red-800/60 text-red-200 text-xs sm:text-sm flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Video Preview & Options Card */}
        {videoData && (
          <div className="mt-8 bg-[#151824] border border-slate-800/80 rounded-2xl p-5 sm:p-6 shadow-2xl space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            {/* Header info */}
            <div className="flex flex-col md:flex-row gap-5 items-start">
              {/* Thumbnail */}
              <div className="relative rounded-xl overflow-hidden bg-slate-900 border border-slate-800 shrink-0 w-full md:w-64 aspect-video">
                {videoData.thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={videoData.thumbnail}
                    alt={videoData.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-600">
                    <Video className="w-8 h-8" />
                  </div>
                )}
                {videoData.duration_formatted && (
                  <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/80 backdrop-blur-md text-[11px] font-mono text-white flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {videoData.duration_formatted}
                  </div>
                )}
                {videoData.is_short && (
                  <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-red-600 text-[10px] font-bold text-white tracking-wider uppercase">
                    Shorts
                  </div>
                )}
              </div>

              {/* Title & Metadata */}
              <div className="flex-1 space-y-2.5">
                <h2 className="text-base sm:text-lg font-bold text-white leading-snug line-clamp-2">
                  {videoData.title}
                </h2>
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                  {videoData.uploader && (
                    <span className="flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-slate-500" />
                      {videoData.uploader}
                    </span>
                  )}
                  {videoData.view_count && (
                    <span className="flex items-center gap-1.5">
                      <Eye className="w-3.5 h-3.5 text-slate-500" />
                      {formatViews(videoData.view_count)}
                    </span>
                  )}
                  <span className="flex items-center gap-1 text-emerald-400">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Verified Stream
                  </span>
                </div>
              </div>
            </div>

            {/* Quality and Format Selector */}
            <div className="border-t border-slate-800/80 pt-5 space-y-3">
              <label className="text-xs font-semibold tracking-wider uppercase text-slate-400">
                Choose Format &amp; Quality:
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                {videoData.options.map((opt, idx) => {
                  const isSelected =
                    selectedOption?.quality === opt.quality &&
                    selectedOption?.type === opt.type;

                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setSelectedOption(opt)}
                      disabled={downloading}
                      className={`flex items-center justify-between p-3 rounded-xl border text-left transition-all ${
                        isSelected
                          ? "bg-rose-500/10 border-rose-500 text-white shadow-sm shadow-rose-500/10"
                          : "bg-[#0d0f15]/70 border-slate-800/80 text-slate-300 hover:border-slate-700 hover:bg-[#10131d]"
                      } ${downloading ? "opacity-60 cursor-not-allowed" : ""}`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                            opt.type === "audio"
                              ? "bg-amber-500/10 text-amber-400"
                              : "bg-red-500/10 text-rose-400"
                          }`}
                        >
                          {opt.type === "audio" ? (
                            <Music className="w-3.5 h-3.5" />
                          ) : (
                            <Play className="w-3.5 h-3.5" />
                          )}
                        </div>
                        <div>
                          <p className="text-xs font-semibold">{opt.label}</p>
                          <p className="text-[10px] text-slate-500 uppercase tracking-wider font-mono">
                            {opt.format}
                          </p>
                        </div>
                      </div>
                      {isSelected && (
                        <CheckCircle2 className="w-4 h-4 text-rose-500 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Action & Progress section */}
            <div className="border-t border-slate-800/80 pt-5 space-y-4">
              {!jobStatus || jobStatus.status === "failed" ? (
                <button
                  type="button"
                  onClick={handleStartDownload}
                  disabled={downloading || !selectedOption}
                  className="w-full py-4 rounded-xl bg-gradient-to-r from-red-600 via-rose-600 to-amber-600 hover:opacity-95 disabled:opacity-50 text-white font-bold text-sm sm:text-base flex items-center justify-center gap-2 shadow-xl shadow-rose-600/20 transition-all cursor-pointer"
                >
                  {downloading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Preparing Media...
                    </>
                  ) : (
                    <>
                      <Download className="w-5 h-5" />
                      Download {selectedOption?.label}
                    </>
                  )}
                </button>
              ) : jobStatus.status === "completed" ? (
                <div className="space-y-3">
                  <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-800/50 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                        <CheckCircle2 className="w-6 h-6" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-white">
                          File Ready for Download!
                        </h4>
                        <p className="text-xs text-slate-400">
                          {jobStatus.filename} &bull; {formatFileSize(jobStatus.file_size)}
                        </p>
                      </div>
                    </div>
                    <a
                      href={`${BACKEND_URL}/jobs/${activeJobId}/download`}
                      download
                      className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm flex items-center gap-2 shadow-lg shadow-emerald-600/25 transition-all"
                    >
                      <Download className="w-4 h-4" />
                      Save File
                    </a>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setJobStatus(null);
                      setActiveJobId(null);
                    }}
                    className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1.5 mx-auto"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Download another resolution or audio
                  </button>
                </div>
              ) : (
                /* In Progress */
                <div className="p-4 rounded-xl bg-[#0d0f15] border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-200 flex items-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-500" />
                      Processing &amp; Merging Streams...
                    </span>
                    <span className="font-mono text-rose-400 font-bold">
                      {jobStatus.progress}%
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full h-2.5 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-red-600 to-rose-500 transition-all duration-300 ease-out"
                      style={{ width: `${Math.max(jobStatus.progress, 5)}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono">
                    <span>Speed: {jobStatus.speed || "Calculating..."}</span>
                    <span>ETA: {jobStatus.eta || "Few seconds"}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Feature Highlights Footer */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-16 text-center">
          <div className="p-4 rounded-xl bg-[#12151f]/60 border border-slate-800/60 space-y-1.5">
            <h4 className="text-sm font-semibold text-slate-200">1080p Full HD</h4>
            <p className="text-xs text-slate-500">Audio and video merged seamlessly with FFmpeg lossless quality.</p>
          </div>
          <div className="p-4 rounded-xl bg-[#12151f]/60 border border-slate-800/60 space-y-1.5">
            <h4 className="text-sm font-semibold text-slate-200">Shorts Compatible</h4>
            <p className="text-xs text-slate-500">Fast extraction for both regular YouTube and vertical Shorts.</p>
          </div>
          <div className="p-4 rounded-xl bg-[#12151f]/60 border border-slate-800/60 space-y-1.5">
            <h4 className="text-sm font-semibold text-slate-200">Real-time Progress</h4>
            <p className="text-xs text-slate-500">Live Server-Sent Events with actual download percentages.</p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 py-6 text-center text-xs text-slate-500">
        <p>&copy; 2026 TubeFetch &bull; Built for personal educational media management.</p>
      </footer>
    </main>
  );
}
