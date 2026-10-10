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
    <main className="stage relative max-w-[1240px] mx-auto min-h-[640px] rounded-[26px] bg-[radial-gradient(120%_90%_at_50%_40%,#56a371_0%,#3f8a5a_45%,#2f6e48_100%)] overflow-hidden shadow-[0_30px_60px_-25px_rgba(20,60,35,0.55)] px-6 sm:px-11 pt-6 sm:pt-7 pb-7 flex flex-col justify-between">
      
      {/* Background Big Watermark Title */}
      <div 
        aria-hidden="true" 
        className="absolute left-1/2 top-14 -translate-x-1/2 text-[clamp(100px,18vw,250px)] font-[800] tracking-[0.01em] leading-none whitespace-nowrap bg-gradient-to-b from-white/55 to-transparent bg-clip-text text-transparent pointer-events-none select-none z-0"
      >
        VYDRIVO
      </div>

      {/* Code Ghost Decorative Snippets with floating drift */}
      <div aria-hidden="true" className="code-ghost-a absolute left-5 top-24 font-mono text-[14px] text-white/20 pointer-events-none whitespace-nowrap hidden lg:block select-none">
        &lt;input type=&quot;url&quot; id=&quot;yt&quot;&gt;
      </div>
      <div aria-hidden="true" className="code-ghost-b absolute left-5 bottom-20 font-mono text-[14px] text-white/20 pointer-events-none whitespace-nowrap hidden lg:block select-none">
        function saveVideo() &#123;
      </div>
      <div aria-hidden="true" className="code-ghost-c absolute right-64 top-24 font-mono text-[14px] text-white/20 pointer-events-none whitespace-nowrap hidden lg:block select-none">
        format: &quot;mp4&quot; | &quot;mp3&quot;
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

      {/* Hero Section (Balanced 2-Column Layout Without Ninja Mascot) */}
      <section className="relative z-10 flex-1 grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] items-center gap-12 pt-8">
        
        {/* Left Column: Copy & Downloader Input */}
        <div className="flex flex-col items-center lg:items-start text-center lg:text-left">
          
          {/* Badge with pulse */}
          <div className="pulse-badge inline-flex items-center gap-3 py-2 pl-2 pr-5 rounded-full bg-white/[0.16] border border-white/[0.35] mb-5 shadow-sm">
            <i className="w-[34px] h-[34px] rounded-full bg-[#f2b632] text-[#1f2a24] grid place-items-center font-bold not-italic">
              ✓
            </i>
            <div className="text-left">
              <b className="block text-[#f2b632] text-[17px] leading-tight font-extrabold">+10 lakh</b>
              <small className="text-[10px] tracking-[0.06em] text-white/80 uppercase font-semibold">VIDEOS SAVED</small>
            </div>
          </div>

          <h1 className="text-[clamp(36px,4.5vw,56px)] leading-[1.06] font-bold tracking-[-0.02em] text-white max-w-[14ch]">
            Save any video you love
          </h1>

          <p className="mt-2.5 italic font-light text-[20px] text-white/80">
            paste the link, pick a format, done
          </p>

          <p className="mt-4 max-w-[42ch] text-[15px] leading-relaxed text-white/85">
            Fast, simple and free. Choose MP4 for video or MP3 for audio, in the quality that suits your phone or laptop.
          </p>

          {/* Input Box Form */}
          <form onSubmit={handleInspect} className="mt-7 flex gap-2 p-1.5 rounded-full bg-white/[0.96] w-full max-w-[480px] shadow-[0_14px_30px_-14px_rgba(0,0,0,0.4)] focus-within:ring-2 focus-within:ring-[#f2b632]">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Paste YouTube link here"
              className="flex-1 min-w-0 border-0 bg-transparent px-4 py-2 font-medium text-[15px] text-[#1f2a24] placeholder-[#7d8d83] focus:outline-none"
            />
            <button 
              type="submit" 
              disabled={loading}
              className="border-0 cursor-pointer font-semibold text-[15px] px-7 py-3.5 rounded-full bg-[#1f2a24] hover:bg-[#0f1612] text-white transition-all transform hover:-translate-y-0.5 disabled:opacity-50 flex items-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Download"}
            </button>
          </form>

          {/* Feedback Messages */}
          {msg && <p className="mt-3 text-[14px] text-white font-medium">{msg}</p>}
          {error && <p className="mt-3 text-[14px] text-[#ffe29a] font-medium flex items-center gap-1.5"><AlertCircle className="w-4 h-4 shrink-0" />{error}</p>}
        </div>

        {/* Right Column: Cards (Format Options & Dynamic Download Result) */}
        <div className="flex flex-col gap-4 w-full" id="formats">
          
          {/* Card 1: MP4 Video */}
          <article className="clip-card p-5 rounded-[22px] bg-[#f3f8f1]/90 text-[#1f2a24] shadow-[0_18px_30px_-20px_rgba(0,0,0,0.5)]">
            <h3 className="text-[18px] font-bold">MP4 Video</h3>
            <p className="text-[13px] leading-snug text-[#53665a] mt-1">Up to 1080p. Plays on every phone and TV.</p>
            <div className="my-3.5 h-20 rounded-xl bg-gradient-to-tr from-[#ffb347] to-[#f2761f] grid place-items-center text-[38px] font-extrabold text-[#2b1a05]">
              ▶
            </div>
            <button 
              onClick={() => {
                if (videoData) {
                  const v = videoData.options.find(o => o.type === "video");
                  if (v) setSelectedOption(v);
                }
              }}
              className="w-full py-2.5 px-4 rounded-full bg-[#f2b632] hover:bg-[#e0a72c] text-[#1f2a24] font-semibold text-[13px] transition-colors cursor-pointer"
            >
              See qualities
            </button>
          </article>

          {/* Card 2: MP3 Audio */}
          <article className="clip-card p-5 rounded-[22px] bg-[#f3f8f1]/90 text-[#1f2a24] shadow-[0_18px_30px_-20px_rgba(0,0,0,0.5)]">
            <h3 className="text-[18px] font-bold">MP3 Audio</h3>
            <p className="text-[13px] leading-snug text-[#53665a] mt-1">Keep only the sound. Great for music &amp; podcasts.</p>
            <div className="my-3.5 h-20 rounded-xl bg-gradient-to-tr from-[#27312b] to-[#0e1511] grid place-items-center text-[38px] font-extrabold text-[#7fc79a]">
              ♪
            </div>
            <button 
              onClick={() => {
                if (videoData) {
                  const a = videoData.options.find(o => o.type === "audio");
                  if (a) setSelectedOption(a);
                }
              }}
              className="w-full py-2.5 px-4 rounded-full bg-[#f2b632] hover:bg-[#e0a72c] text-[#1f2a24] font-semibold text-[13px] transition-colors cursor-pointer"
            >
              See bitrates
            </button>
          </article>

          <p className="text-[13px] text-white/80 pl-1.5 hidden lg:block" id="how">
            <b className="block text-white">How it works</b>
            Paste link &rarr; choose format &rarr; save.
          </p>
        </div>
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
  );
}
