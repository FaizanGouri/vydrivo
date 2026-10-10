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
  ArrowUpRight,
  Clock,
  Eye,
  User,
  ShieldCheck,
  RefreshCw,
  Zap,
  Layers,
  Sliders,
  Check,
  Flame,
  CheckCircle,
  Activity,
  Globe2,
  Cpu
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

const TICKER_ITEMS = [
  "4K Ultra HD",
  "1080p 60FPS",
  "YouTube Shorts",
  "High Speed FFmpeg",
  "Lossless 320 kbps MP3",
  "Zero Adware",
  "Real-time Stream Engine",
  "Audio Extraction",
  "Private & Untracked"
];

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
  const inputSectionRef = useRef<HTMLDivElement | null>(null);

  // Clean up SSE on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  const scrollToInput = () => {
    inputSectionRef.current?.scrollIntoView({ behavior: "smooth" });
  };

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
    <div className="min-h-screen bg-[#06070b] text-slate-100 flex flex-col justify-between selection:bg-rose-500 selection:text-white relative overflow-hidden bg-grid-pattern">
      {/* Dynamic Animated Ambient Glow Spots */}
      <div className="glow-orb-magenta -top-48 -left-48 w-[650px] h-[650px]"></div>
      <div className="glow-orb-amber -top-24 -right-24 w-[600px] h-[600px]"></div>
      <div className="glow-orb-violet top-[42%] left-[25%] w-[800px] h-[800px]"></div>

      {/* Top Floating Glass Navbar */}
      <header className="border-b border-white/[0.08] bg-[#090b10]/60 backdrop-blur-2xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          {/* Logo with Vibrant Neon Accent */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-rose-500 via-orange-500 to-amber-400 p-[1.5px] shadow-lg shadow-rose-500/30">
              <div className="w-full h-full bg-[#0d0e15] rounded-[10px] flex items-center justify-center">
                <Play className="w-4 h-4 text-amber-400 fill-amber-400" />
              </div>
            </div>
            <div className="text-xl font-black tracking-tight flex items-center text-white">
              <span className="text-amber-400 font-extrabold">WE</span>
              <span className="text-white">03</span>
              <span className="text-rose-400 text-[10px] px-2 py-0.5 ml-2 font-mono uppercase tracking-wider rounded-full border border-rose-500/30 bg-rose-500/10 font-bold">
                STUDIO
              </span>
            </div>
          </div>

          {/* Navigation Links with Glow Hover */}
          <nav className="hidden md:flex items-center gap-8 text-xs font-semibold tracking-wider uppercase text-slate-400">
            <a href="#downloader" className="hover:text-amber-400 transition-colors">Products</a>
            <a href="#services" className="hover:text-rose-400 transition-colors">Solutions</a>
            <a href="#stats" className="hover:text-amber-400 transition-colors">Customer</a>
            <a href="#formats" className="hover:text-rose-400 transition-colors">Pricing</a>
            <a href="#features" className="hover:text-amber-400 transition-colors">Resources</a>
          </nav>

          {/* Action CTA with Shimmer & Glow */}
          <button 
            onClick={scrollToInput}
            className="group relative flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold tracking-wider uppercase bg-white/10 hover:bg-white/20 text-white border border-white/20 hover:border-amber-400/50 transition-all shadow-xl hover:shadow-amber-500/20 cursor-pointer overflow-hidden"
          >
            <span className="relative z-10 flex items-center gap-1.5">
              REGISTER NOW
              <ArrowUpRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </span>
          </button>
        </div>
      </header>

      {/* HERO SECTION */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 pt-12 pb-24 w-full flex flex-col items-center">
        {/* Main Title Matching Screenshot */}
        <div className="text-center space-y-3 max-w-3xl mx-auto">
          <h1 className="text-5xl sm:text-7xl lg:text-8xl font-black tracking-tight text-white leading-none">
            Web3 Design
            <span className="block mt-2 bg-gradient-to-r from-rose-500 via-amber-400 to-orange-500 bg-clip-text text-transparent drop-shadow-[0_10px_20px_rgba(244,63,94,0.3)]">
              Agency.
            </span>
          </h1>
        </div>

        {/* Hero Interactive Tri-Column Layout (Matching Screenshot) */}
        <div className="w-full mt-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          
          {/* Left Stats Badges (Like 240+ Partners & 92% in Screenshot) */}
          <div className="hidden lg:flex lg:col-span-3 flex-col gap-6">
            <div className="glass-panel glass-panel-interactive rounded-2xl p-6 border border-white/10 shadow-xl">
              <span className="text-3xl font-black text-white block tracking-tight">240+</span>
              <span className="text-[11px] font-semibold tracking-widest uppercase text-slate-400 mt-1 block">PARTNERS</span>
            </div>
            
            <div className="glass-panel glass-panel-interactive rounded-2xl p-6 border border-white/10 shadow-xl">
              <span className="text-3xl font-black bg-gradient-to-r from-rose-400 to-amber-400 bg-clip-text text-transparent block tracking-tight">92%</span>
              <span className="text-[11px] font-semibold tracking-widest uppercase text-slate-400 mt-1 block">FASTER TECHNOLOGY</span>
            </div>
          </div>

          {/* Center Downloader Element (Glowing Card with Alive 3D Aesthetic) */}
          <div ref={inputSectionRef} className="lg:col-span-6 w-full flex flex-col items-center">
            
            {/* Visual Futuristic Artwork Orb Indicator */}
            <div className="w-20 h-20 mb-6 rounded-3xl bg-gradient-to-tr from-rose-500 via-amber-500 to-violet-600 p-[2px] animate-float shadow-2xl shadow-rose-500/30">
              <div className="w-full h-full bg-[#0d0f17] rounded-[22px] flex items-center justify-center relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-tr from-rose-500/20 via-transparent to-amber-500/20"></div>
                <Flame className="w-9 h-9 text-amber-400 drop-shadow-[0_0_10px_rgba(245,158,11,0.8)]" />
              </div>
            </div>

            <div className="w-full gradient-border-wrap">
              <div className="glass-panel rounded-[24px] p-6 sm:p-8 backdrop-blur-3xl bg-[#0f121d]/90 shadow-2xl space-y-6">
                
                {/* Header inside card */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                    </span>
                    <span className="text-xs font-bold tracking-wider uppercase text-slate-200">
                      Decentralized Stream Pipeline
                    </span>
                  </div>
                  <span className="text-[10px] font-mono font-bold px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center gap-1">
                    <Activity className="w-3 h-3 animate-spin" />
                    Ultra 60FPS
                  </span>
                </div>

                {/* Form */}
                <form onSubmit={handleInspect} className="space-y-4">
                  <div className="relative group">
                    <input
                      type="text"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="Paste YouTube or Shorts link (e.g. https://youtu.be/...)"
                      className="w-full bg-[#08090f] border border-white/15 rounded-2xl px-5 py-4 pl-5 pr-28 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 transition-all shadow-inner"
                    />
                    <button
                      type="button"
                      onClick={handlePaste}
                      className="absolute right-3 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs text-white font-medium flex items-center gap-1.5 transition-colors border border-white/15 cursor-pointer shadow-sm"
                    >
                      <Clipboard className="w-3.5 h-3.5 text-amber-400" />
                      Paste
                    </button>
                  </div>

                  {/* High Contrast Primary CTA Button */}
                  <button
                    type="submit"
                    disabled={loading || !url.trim()}
                    className="relative w-full py-4 rounded-2xl bg-white hover:bg-slate-100 text-black disabled:opacity-40 disabled:cursor-not-allowed font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-[0_0_30px_rgba(255,255,255,0.3)] transition-all cursor-pointer overflow-hidden group"
                  >
                    <div className="animate-shimmer pointer-events-none"></div>
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-black" />
                        Analyzing Stream Metadata...
                      </>
                    ) : (
                      <>
                        Inspect &amp; Fetch Media
                        <ArrowUpRight className="w-4 h-4 text-black group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                      </>
                    )}
                  </button>
                </form>

                {/* Error Banner */}
                {error && (
                  <div className="p-4 rounded-2xl bg-rose-950/50 border border-rose-500/50 text-rose-200 text-xs flex items-start gap-3 animate-in fade-in">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Micro-Copy & Get Started (Matching Screenshot) */}
          <div className="hidden lg:flex lg:col-span-3 flex-col gap-6">
            <div className="glass-panel glass-panel-interactive rounded-2xl p-6 border border-white/10 space-y-5">
              <p className="text-xs text-slate-300 leading-relaxed font-light">
                Better data leads to more performance models. Performant models lead to faster deployment.
              </p>
              <button 
                onClick={scrollToInput}
                className="w-full py-3 rounded-full bg-white text-black font-black text-xs tracking-wider uppercase hover:bg-slate-200 transition-all shadow-lg hover:shadow-white/20 cursor-pointer"
              >
                GET STARTED
              </button>
            </div>
          </div>
        </div>

        {/* Video Preview & Download Card (Appears smoothly after inspect) */}
        {videoData && (
          <div className="w-full max-w-4xl mt-12 animate-in fade-in slide-in-from-bottom-8 duration-500">
            <div className="gradient-border-wrap">
              <div className="glass-panel rounded-[24px] p-6 sm:p-8 backdrop-blur-3xl bg-[#0f121d]/95 space-y-6">
                
                {/* Thumbnail & Video Details */}
                <div className="flex flex-col md:flex-row gap-6 items-start">
                  <div className="relative rounded-2xl overflow-hidden bg-black/80 border border-white/10 shrink-0 w-full md:w-72 aspect-video shadow-2xl">
                    {videoData.thumbnail ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={videoData.thumbnail}
                        alt={videoData.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-600">
                        <Video className="w-10 h-10" />
                      </div>
                    )}
                    {videoData.duration_formatted && (
                      <div className="absolute bottom-2.5 right-2.5 px-2.5 py-1 rounded-lg bg-black/80 backdrop-blur-md text-[11px] font-mono text-white flex items-center gap-1.5 border border-white/10">
                        <Clock className="w-3 h-3 text-amber-400" />
                        {videoData.duration_formatted}
                      </div>
                    )}
                    {videoData.is_short && (
                      <div className="absolute top-2.5 left-2.5 px-3 py-1 rounded-lg bg-gradient-to-r from-rose-600 to-red-600 text-[10px] font-extrabold text-white tracking-widest uppercase shadow-lg shadow-rose-600/40">
                        Shorts
                      </div>
                    )}
                  </div>

                  <div className="flex-1 space-y-3">
                    <h3 className="text-lg sm:text-xl font-black text-white leading-snug line-clamp-2">
                      {videoData.title}
                    </h3>
                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400">
                      {videoData.uploader && (
                        <span className="flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-amber-400" />
                          {videoData.uploader}
                        </span>
                      )}
                      {videoData.view_count && (
                        <span className="flex items-center gap-1.5">
                          <Eye className="w-3.5 h-3.5 text-rose-400" />
                          {formatViews(videoData.view_count)}
                        </span>
                      )}
                      <span className="flex items-center gap-1.5 text-emerald-400 font-bold">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        Audio &amp; Video Streams Online
                      </span>
                    </div>
                  </div>
                </div>

                {/* Quality & Format Selection Grid */}
                <div className="border-t border-white/10 pt-6 space-y-3">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-400">
                    Select Target Resolution:
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
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
                          className={`flex items-center justify-between p-3.5 rounded-2xl border text-left transition-all ${
                            isSelected
                              ? "bg-rose-500/20 border-rose-500 text-white shadow-xl shadow-rose-500/20 scale-[1.02]"
                              : "bg-white/[0.03] border-white/10 text-slate-300 hover:border-white/20 hover:bg-white/[0.06]"
                          } ${downloading ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                                opt.type === "audio"
                                  ? "bg-amber-500/20 text-amber-400"
                                  : "bg-rose-500/20 text-rose-400"
                              }`}
                            >
                              {opt.type === "audio" ? (
                                <Music className="w-4 h-4" />
                              ) : (
                                <Play className="w-4 h-4" />
                              )}
                            </div>
                            <div>
                              <p className="text-xs font-black text-white">{opt.label}</p>
                              <p className="text-[10px] text-slate-500 uppercase tracking-widest font-mono">
                                {opt.format}
                              </p>
                            </div>
                          </div>
                          {isSelected && (
                            <CheckCircle2 className="w-4 h-4 text-rose-400 shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Progress / Download CTA Button */}
                <div className="border-t border-white/10 pt-6">
                  {!jobStatus || jobStatus.status === "failed" ? (
                    <button
                      type="button"
                      onClick={handleStartDownload}
                      disabled={downloading || !selectedOption}
                      className="w-full py-4 rounded-2xl bg-gradient-to-r from-rose-500 via-orange-500 to-amber-500 hover:opacity-95 disabled:opacity-40 text-white font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-2xl shadow-rose-500/40 transition-all cursor-pointer"
                    >
                      {downloading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin text-white" />
                          Multiplexing Streams With FFmpeg...
                        </>
                      ) : (
                        <>
                          <Download className="w-4 h-4" />
                          Download {selectedOption?.label}
                        </>
                      )}
                    </button>
                  ) : jobStatus.status === "completed" ? (
                    <div className="space-y-4">
                      <div className="p-5 rounded-2xl bg-emerald-950/40 border border-emerald-500/50 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 flex items-center justify-center text-emerald-400 border border-emerald-500/30">
                            <CheckCircle className="w-6 h-6" />
                          </div>
                          <div>
                            <h4 className="text-sm font-black text-white">
                              Video Ready To Save!
                            </h4>
                            <p className="text-xs text-slate-400">
                              {jobStatus.filename} &bull; {formatFileSize(jobStatus.file_size)}
                            </p>
                          </div>
                        </div>
                        <a
                          href={`${BACKEND_URL}/jobs/${activeJobId}/download`}
                          download
                          className="w-full sm:w-auto px-7 py-3.5 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-black font-black text-xs tracking-wider uppercase flex items-center justify-center gap-2 shadow-xl shadow-emerald-400/30 transition-all cursor-pointer"
                        >
                          <Download className="w-4 h-4 text-black" />
                          Save File
                        </a>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setJobStatus(null);
                          setActiveJobId(null);
                        }}
                        className="text-xs text-slate-400 hover:text-white flex items-center gap-1.5 mx-auto transition-colors cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Download in another resolution
                      </button>
                    </div>
                  ) : (
                    /* Live Progress Bar */
                    <div className="p-5 rounded-2xl bg-black/80 border border-white/10 space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-200 flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                          Processing &amp; Merging Video/Audio...
                        </span>
                        <span className="font-mono text-amber-400 font-black">
                          {jobStatus.progress}%
                        </span>
                      </div>

                      <div className="w-full h-3 rounded-full bg-white/10 overflow-hidden p-[2px]">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-rose-500 via-orange-500 to-amber-400 transition-all duration-300 ease-out shadow-[0_0_15px_rgba(244,63,94,0.7)]"
                          style={{ width: `${Math.max(jobStatus.progress, 5)}%` }}
                        />
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                        <span>Speed: {jobStatus.speed || "Calculating..."}</span>
                        <span>ETA: {jobStatus.eta || "Few seconds"}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* HORIZONTAL MARQUEE BANNER (Exact Style from Screenshot) */}
      <div className="w-full border-y border-white/[0.08] bg-[#090b10]/80 backdrop-blur-2xl py-4 overflow-hidden relative">
        <div className="animate-marquee whitespace-nowrap flex items-center text-xs font-black uppercase tracking-widest text-slate-300">
          {[...TICKER_ITEMS, ...TICKER_ITEMS, ...TICKER_ITEMS].map((item, idx) => (
            <span key={idx} className="flex items-center mx-6">
              <span className="text-orange-400 mr-5 font-normal text-sm">✦</span>
              {item}
            </span>
          ))}
        </div>
      </div>

      {/* SECTION: OUR SERVICES (Matches Second Fold of Screenshot) */}
      <section id="services" className="max-w-7xl mx-auto px-6 py-28 w-full">
        <div className="text-center mb-20 space-y-3">
          <h2 className="text-4xl sm:text-6xl font-black text-white tracking-tight">
            Our Services
          </h2>
          <p className="text-slate-400 text-sm max-w-md mx-auto font-light">
            Hands-on media conversion and real-time processing pipelines.
          </p>
        </div>

        {/* Feature Showcase Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          
          {/* Left Text / Bullet Points (Exact UI/UX Design block from Screenshot) */}
          <div className="lg:col-span-6 space-y-6">
            <h3 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
              UI/UX Design
            </h3>
            <p className="text-slate-400 text-sm leading-relaxed font-light">
              Hands-on learning via real-life innovation projects. Save Rs 8,210 on this course. Create immersive UI via wireframes. Conduct heuristic evaluations of your UX design.
            </p>

            <ul className="space-y-3 pt-2">
              {[
                "User Interface design",
                "User Experience Design",
                "Mobile Application design"
              ].map((bullet, idx) => (
                <li key={idx} className="flex items-center gap-3 text-sm text-slate-200">
                  <div className="w-5 h-5 rounded-full bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 shrink-0">
                    <Check className="w-3 h-3" />
                  </div>
                  {bullet}
                </li>
              ))}
            </ul>

            <div className="pt-4">
              <button 
                onClick={scrollToInput}
                className="px-6 py-3 rounded-full text-xs font-black uppercase tracking-wider bg-white/10 hover:bg-white/15 text-white border border-white/20 hover:border-amber-400/50 transition-all flex items-center gap-2 cursor-pointer shadow-lg"
              >
                LEARN MORE
                <ArrowUpRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Right Visual 3D-Look Mockup Card (Like Illustrated UI in Screenshot) */}
          <div className="lg:col-span-6">
            <div className="gradient-border-wrap">
              <div className="glass-panel rounded-[24px] p-8 bg-[#0c0e17]/95 shadow-2xl space-y-6">
                
                {/* Window top bar */}
                <div className="flex items-center justify-between border-b border-white/10 pb-4">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-rose-500 shadow-sm shadow-rose-500"></span>
                    <span className="w-3 h-3 rounded-full bg-amber-500 shadow-sm shadow-amber-500"></span>
                    <span className="w-3 h-3 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500"></span>
                  </div>
                  <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5">
                    <Cpu className="w-3.5 h-3.5 text-amber-400" />
                    FFmpeg 9.0 GPU Engine
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/10 space-y-2 hover:border-amber-400/30 transition-colors">
                    <Zap className="w-5 h-5 text-amber-400" />
                    <h5 className="text-xs font-bold text-white uppercase">Fast Encoding</h5>
                    <p className="text-[11px] text-slate-400">Lossless multiplexing of separate YouTube audio &amp; video tracks.</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/10 space-y-2 hover:border-rose-400/30 transition-colors">
                    <Layers className="w-5 h-5 text-rose-400" />
                    <h5 className="text-xs font-bold text-white uppercase">Multi-Format</h5>
                    <p className="text-[11px] text-slate-400">1080p, 720p, 480p and high-bitrate MP3 audio formats.</p>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-gradient-to-r from-rose-500/15 via-amber-500/10 to-transparent border border-white/10 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Sliders className="w-5 h-5 text-rose-400" />
                    <div>
                      <p className="text-xs font-bold text-white">Dynamic Stream Bitrate</p>
                      <p className="text-[10px] text-slate-400 font-mono">Max Quality: 320 kbps / 60 FPS</p>
                    </div>
                  </div>
                  <span className="text-[11px] font-black text-emerald-400 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30">
                    ONLINE
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* METRICS & STATS SECTION (Exact Bottom Section from Screenshot: 5M+, 450M+, 22%, 8.03%) */}
      <section id="stats" className="border-t border-white/[0.08] bg-[#090b10]/90 backdrop-blur-2xl py-20">
        <div className="max-w-6xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          <div className="space-y-1">
            <h4 className="text-4xl sm:text-6xl font-black text-white tracking-tight">5M+</h4>
            <p className="text-xs font-semibold text-slate-400 tracking-wider">Customer</p>
          </div>
          <div className="space-y-1">
            <h4 className="text-4xl sm:text-6xl font-black text-white tracking-tight">450M+</h4>
            <p className="text-xs font-semibold text-slate-400 tracking-wider">Coverage</p>
          </div>
          <div className="space-y-1">
            <h4 className="text-4xl sm:text-6xl font-black text-white tracking-tight">22%</h4>
            <p className="text-xs font-semibold text-slate-400 tracking-wider">Earning</p>
          </div>
          <div className="space-y-1">
            <h4 className="text-4xl sm:text-6xl font-black text-white tracking-tight">8.03%</h4>
            <p className="text-xs font-semibold text-slate-400 tracking-wider">Interest</p>
          </div>
        </div>
      </section>

      {/* SECTION: OUR HAPPY CUSTOMERS (Matching Screenshot) */}
      <section className="py-24 text-center space-y-4">
        <h3 className="text-4xl sm:text-6xl font-black text-white tracking-tight">
          Our happy Customers
        </h3>
        <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto">
          Loved by digital artists, video creators, and web3 agencies worldwide.
        </p>

        {/* Small Avatar Dots */}
        <div className="flex items-center justify-center gap-3 pt-6">
          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-rose-500 to-amber-500 border-2 border-[#06070b] flex items-center justify-center text-xs font-black shadow-lg">
            JD
          </div>
          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-violet-500 to-rose-500 border-2 border-[#06070b] flex items-center justify-center text-xs font-black shadow-lg -ml-4">
            AK
          </div>
          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-amber-400 to-orange-500 border-2 border-[#06070b] flex items-center justify-center text-xs font-black shadow-lg -ml-4">
            MR
          </div>
          <span className="text-xs font-bold text-slate-400 ml-2">4.9 / 5.0 Rating</span>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-white/[0.08] bg-[#050609] py-8 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>&copy; 2026 WE03 Studio &bull; Next-Gen Decentralized Media Downloader.</p>
          <div className="flex gap-6 text-slate-400 font-medium">
            <a href="#" className="hover:text-white transition-colors">Privacy</a>
            <a href="#" className="hover:text-white transition-colors">Terms</a>
            <a href="#" className="hover:text-white transition-colors">API</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
