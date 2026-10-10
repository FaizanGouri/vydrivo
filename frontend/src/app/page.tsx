"use client";

import React, { useState, useEffect, useRef } from "react";
import { 
  Download, 
  CheckCircle2, 
  Loader2, 
  Clock, 
  Eye, 
  User, 
  RefreshCw,
  Play,
  Music,
  Video,
  AlertCircle
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
  const [msg, setMsg] = useState<string | null>(null);
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

  // Loading Screen State & Animation Loop
  const [showLoader, setShowLoader] = useState(true);
  const [loaderDone, setLoaderDone] = useState(false);
  const [loaderPct, setLoaderPct] = useState(0);
  const [loaderText, setLoaderText] = useState("Gathering your favourite platforms…");

  useEffect(() => {
    const MIN_TIME = 4200; // 4.2 seconds
    const steps: [number, string][] = [
      [0, "Gathering your favourite platforms…"],
      [30, "Mixing it all together…"],
      [75, "Almost there…"],
      [100, "Ready!"]
    ];

    const start = performance.now();
    let animId: number;

    const tick = (now: number) => {
      const t = Math.min((now - start) / MIN_TIME, 1);
      const eased = 1 - Math.pow(1 - t, 2);
      const pct = Math.round(eased * 100);
      setLoaderPct(pct);

      for (const [at, label] of steps) {
        if (pct >= at) setLoaderText(label);
      }

      if (pct >= 100) {
        setTimeout(() => {
          setLoaderDone(true); // slides up
          setTimeout(() => {
            setShowLoader(false); // remove from DOM
          }, 1000);
        }, 350);
        return;
      }
      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, []);

  const handleInspect = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanUrl = url.trim();
    if (!cleanUrl) {
      setError("Please paste a valid YouTube video or Shorts link.");
      setMsg(null);
      return;
    }

    setLoading(true);
    setError(null);
    setMsg("Link looks good. Fetching video details…");
    setVideoData(null);
    setJobStatus(null);
    setActiveJobId(null);

    try {
      const res = await fetch(`${BACKEND_URL}/inspect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: cleanUrl }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.detail || "Failed to inspect video.");
      }

      setVideoData(json.data);
      if (json.data.options && json.data.options.length > 0) {
        setSelectedOption(json.data.options[0]);
      }
      setMsg(null);
    } catch (err: unknown) {
      setMsg(null);
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
          // heartbeat
        }
      };

      sse.onerror = () => {
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
    <>
      {/* ================= LOADING SCREEN ================= */}
      {showLoader && (
        <div className={`loader ${loaderDone ? "done" : ""}`} role="status" aria-label="Loading VYDRIVO">
          <div className="l-ghost" aria-hidden="true">VYDRIVO</div>

          <div className="l-center">
            <div className="mix" aria-hidden="true">
              <div className="blob"></div>
              {/* YouTube Logo */}
              <div className="lg yt">
                <svg viewBox="0 0 64 64">
                  <rect x="3" y="13" width="58" height="38" rx="12" fill="#ff0000" />
                  <path d="M26 23v18l16-9z" fill="#fff" />
                </svg>
              </div>
              {/* Instagram Logo */}
              <div className="lg ig">
                <svg viewBox="0 0 64 64">
                  <defs>
                    <linearGradient id="igG" x1="0" y1="1" x2="1" y2="0">
                      <stop offset="0" stopColor="#fdc468" />
                      <stop offset="0.5" stopColor="#df4996" />
                      <stop offset="1" stopColor="#4f5bd5" />
                    </linearGradient>
                  </defs>
                  <rect x="5" y="5" width="54" height="54" rx="16" fill="url(#igG)" />
                  <circle cx="32" cy="32" r="12" fill="none" stroke="#fff" strokeWidth="4.5" />
                  <circle cx="46" cy="18" r="3.6" fill="#fff" />
                </svg>
              </div>
              {/* Pinterest Logo */}
              <div className="lg pi">
                <svg viewBox="0 0 64 64">
                  <circle cx="32" cy="32" r="29" fill="#e60023" />
                  <text x="32" y="45" textAnchor="middle" fontFamily="Georgia,serif" fontSize="38" fontWeight="700" fill="#fff">P</text>
                </svg>
              </div>
              {/* Facebook Logo */}
              <div className="lg fb">
                <svg viewBox="0 0 64 64">
                  <circle cx="32" cy="32" r="29" fill="#1877f2" />
                  <text x="35" y="50" textAnchor="middle" fontFamily="Arial,sans-serif" fontSize="46" fontWeight="700" fill="#fff">f</text>
                </svg>
              </div>
              {/* VYDRIVO animated letters */}
              <div className="l-word">
                {"VYDRIVO".split("").map((char, idx) => (
                  <span key={idx} style={{ ["--i" as string]: idx } as React.CSSProperties}>
                    {char}
                  </span>
                ))}
              </div>
            </div>

            <div className="l-bar" aria-hidden="true">
              <i style={{ width: `${loaderPct}%` }}></i>
            </div>
            <div className="l-meta">
              <span>{loaderText}</span>
              <b>{loaderPct}%</b>
            </div>
          </div>
        </div>
      )}

      <main className="stage relative max-w-[1240px] mx-auto min-h-[640px] rounded-[26px] bg-[radial-gradient(120%_90%_at_50%_40%,#56a371_0%,#3f8a5a_45%,#2f6e48_100%)] overflow-hidden shadow-[0_30px_60px_-25px_rgba(20,60,35,0.55)] px-6 sm:px-11 pt-6 sm:pt-7 pb-7 flex flex-col justify-between">
        
        {/* Background Big Watermark Title with Continuous Floating Levitation */}
        <div 
          aria-hidden="true" 
          className="floating-watermark absolute left-1/2 top-14 text-[clamp(100px,18vw,250px)] font-[800] tracking-[0.01em] leading-none whitespace-nowrap bg-gradient-to-b from-white/60 via-white/30 to-transparent bg-clip-text text-transparent pointer-events-none select-none z-0"
        >
          VYDRIVO
        </div>

      {/* Top Navigation */}
      <nav className="relative z-10 flex items-center justify-between gap-4">
        <a className="font-bold text-[24px] tracking-[-0.01em] text-white" href="#">
          vydrivo<span className="text-[#f2b632]">.</span>
        </a>

        <div className="flex gap-1.5 p-1.5 rounded-full bg-white/[0.16] border border-white/[0.35] backdrop-blur-md">
          <a href="#" className="px-5 py-2.5 rounded-full text-[15px] font-medium bg-white/20 text-white transition-colors">Home</a>
          <a href="#formats" className="px-5 py-2.5 rounded-full text-[15px] font-medium hover:bg-white/20 text-white transition-colors">Formats</a>
          <a href="#how" className="px-5 py-2.5 rounded-full text-[15px] font-medium hover:bg-white/20 text-white transition-colors">How it works</a>
          <a href="#contact" className="px-5 py-2.5 rounded-full text-[15px] font-medium hover:bg-white/20 text-white transition-colors">Contact</a>
        </div>
      </nav>

      {/* Hero Section (Centered Clean & Focused Downloader) */}
      <section className="relative z-10 flex-1 flex flex-col items-center justify-center text-center py-10">
        
        {/* Centered Floating Badge */}
        <div className="floating-badge inline-flex items-center gap-3 py-2 pl-2 pr-5 rounded-full bg-white/[0.18] border border-white/[0.35] mb-5 shadow-lg backdrop-blur-md">
          <i className="w-[34px] h-[34px] rounded-full bg-[#f2b632] text-[#1f2a24] grid place-items-center font-bold not-italic">
            ✓
          </i>
          <div className="text-left">
            <b className="block text-[#f2b632] text-[17px] leading-tight font-extrabold">+10 lakh</b>
            <small className="text-[10px] tracking-[0.06em] text-white/80 uppercase font-semibold">VIDEOS SAVED</small>
          </div>
        </div>

        <h1 className="text-[clamp(36px,5vw,62px)] leading-[1.08] font-bold tracking-[-0.02em] text-white max-w-[18ch]">
          Save any video you love
        </h1>

        <p className="mt-3 italic font-light text-[22px] text-white/85">
          paste the link, pick a format, done
        </p>

        <p className="mt-4 max-w-[48ch] text-[15px] sm:text-[16px] leading-relaxed text-white/90">
          Fast, simple and free. Choose MP4 for video or MP3 for audio, in the quality that suits your phone or laptop.
        </p>

        {/* Input Box Form */}
        <form onSubmit={handleInspect} className="mt-8 flex gap-2 p-1.5 rounded-full bg-white/[0.96] w-full max-w-[540px] shadow-[0_16px_35px_-12px_rgba(0,0,0,0.4)] focus-within:ring-3 focus-within:ring-[#f2b632]">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste YouTube link here"
            className="flex-1 min-w-0 border-0 bg-transparent px-5 py-2.5 font-medium text-[16px] text-[#1f2a24] placeholder-[#7d8d83] focus:outline-none"
          />
          <button 
            type="submit" 
            disabled={loading}
            className="border-0 cursor-pointer font-semibold text-[15px] px-8 py-3.5 rounded-full bg-[#1f2a24] hover:bg-[#0f1612] text-white transition-all transform hover:-translate-y-0.5 disabled:opacity-50 flex items-center gap-2 shadow-md"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Download"}
          </button>
        </form>

        {/* Feedback Messages */}
        {msg && <p className="mt-4 text-[14px] text-white font-medium">{msg}</p>}
        {error && <p className="mt-4 text-[14px] text-[#ffe29a] font-medium flex items-center gap-1.5"><AlertCircle className="w-4 h-4 shrink-0" />{error}</p>}
      </section>

      {/* Dynamic Video Preview / Processing Modal / Drawer if video is fetched */}
      {videoData && (
        <section className="relative z-20 mt-8 p-5 sm:p-6 rounded-[22px] bg-[#f3f8f1] text-[#1f2a24] shadow-2xl animate-in fade-in slide-in-from-bottom-6">
          <div className="flex flex-col md:flex-row gap-5 items-start justify-between">
            
            {/* Thumbnail */}
            <div className="relative rounded-xl overflow-hidden bg-slate-200 shrink-0 w-full md:w-60 aspect-video shadow-md">
              {videoData.thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={videoData.thumbnail}
                  alt={videoData.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-400">
                  <Video className="w-8 h-8" />
                </div>
              )}
              {videoData.duration_formatted && (
                <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/80 text-[11px] font-mono text-white flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {videoData.duration_formatted}
                </div>
              )}
            </div>

            {/* Video Details */}
            <div className="flex-1 space-y-2">
              <h2 className="text-base sm:text-lg font-bold text-[#1f2a24] leading-snug line-clamp-2">
                {videoData.title}
              </h2>
              <div className="flex flex-wrap items-center gap-3 text-xs text-[#53665a]">
                {videoData.uploader && (
                  <span className="flex items-center gap-1 font-medium">
                    <User className="w-3.5 h-3.5" />
                    {videoData.uploader}
                  </span>
                )}
                {videoData.view_count && (
                  <span className="flex items-center gap-1 font-medium">
                    <Eye className="w-3.5 h-3.5" />
                    {formatViews(videoData.view_count)}
                  </span>
                )}
              </div>

              {/* Quality selector buttons */}
              <div className="pt-2">
                <p className="text-xs font-bold text-[#1f2a24] uppercase tracking-wider mb-2">Available Options:</p>
                <div className="flex flex-wrap gap-2">
                  {videoData.options.map((opt, idx) => {
                    const isSelected = selectedOption?.quality === opt.quality && selectedOption?.type === opt.type;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setSelectedOption(opt)}
                        disabled={downloading}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1.5 ${
                          isSelected
                            ? "bg-[#3f8a5a] text-white border-[#3f8a5a] shadow-sm"
                            : "bg-white text-[#1f2a24] border-slate-300 hover:border-[#3f8a5a]"
                        }`}
                      >
                        {opt.type === "audio" ? <Music className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Download Button / Progress */}
            <div className="w-full md:w-64 shrink-0 flex flex-col justify-center">
              {!jobStatus || jobStatus.status === "failed" ? (
                <button
                  type="button"
                  onClick={handleStartDownload}
                  disabled={downloading || !selectedOption}
                  className="w-full py-3.5 rounded-full bg-[#f2b632] hover:bg-[#e0a72c] text-[#1f2a24] font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {downloading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Converting...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      Download {selectedOption?.quality}
                    </>
                  )}
                </button>
              ) : jobStatus.status === "completed" ? (
                <div className="space-y-2 text-center">
                  <a
                    href={`${BACKEND_URL}/jobs/${activeJobId}/download`}
                    download
                    className="w-full py-3.5 rounded-full bg-[#3f8a5a] hover:bg-[#2f6e48] text-white font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Save File ({formatFileSize(jobStatus.file_size)})
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      setJobStatus(null);
                      setActiveJobId(null);
                    }}
                    className="text-xs text-[#53665a] hover:text-[#1f2a24] inline-flex items-center gap-1 mt-1 cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Pick another format
                  </button>
                </div>
              ) : (
                /* In Progress */
                <div className="p-3.5 rounded-xl bg-white border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-[#1f2a24]">
                    <span>Merging streams...</span>
                    <span>{jobStatus.progress}%</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full bg-[#3f8a5a] transition-all duration-300"
                      style={{ width: `${Math.max(jobStatus.progress, 5)}%` }}
                    />
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono text-center">
                    {jobStatus.speed || "Processing..."}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="relative z-10 mt-5 pt-4 border-t border-white/[0.18] flex flex-wrap justify-between items-center gap-3 text-[12.5px] text-white/75" id="contact">
        <span>&copy; 2026 VYDRIVO. All rights reserved.</span>
        <span>Download only content you own or have permission to save.</span>
      </footer>
    </main>
  </>
);
}
