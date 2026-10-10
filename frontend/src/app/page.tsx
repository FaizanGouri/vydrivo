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
  Check
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
  "Lossless MP3",
  "Zero Ads",
  "Instant Conversion",
  "Audio Extraction",
  "Private & Secure"
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
    <div className="min-h-screen bg-[#08090d] text-slate-100 flex flex-col justify-between selection:bg-rose-500 selection:text-white relative overflow-hidden">
      {/* Background Ambient Glow Orbs */}
      <div className="glow-orb-purple -top-40 -left-40 w-[600px] h-[600px] opacity-75"></div>
      <div className="glow-orb-orange -top-20 -right-20 w-[550px] h-[550px] opacity-60"></div>
      <div className="glow-orb-cyan top-[45%] left-[25%] w-[700px] h-[700px] opacity-40"></div>

      {/* Top Navbar */}
      <header className="border-b border-white/[0.07] bg-[#090b10]/70 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="text-xl font-black tracking-tight flex items-center gap-1 text-white">
              <span className="text-amber-500">WE</span>
              <span>03</span>
              <span className="text-rose-500 text-xs px-2 py-0.5 ml-2 font-mono uppercase rounded-full border border-rose-500/30 bg-rose-500/10 font-bold">
                STUDIO
              </span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-8 text-xs font-semibold tracking-wider uppercase text-slate-400">
            <a href="#features" className="hover:text-white transition-colors">Products</a>
            <a href="#services" className="hover:text-white transition-colors">Solutions</a>
            <a href="#stats" className="hover:text-white transition-colors">Customer</a>
            <a href="#formats" className="hover:text-white transition-colors">Pricing</a>
            <a href="#about" className="hover:text-white transition-colors">Resources</a>
          </nav>

          {/* Action CTA */}
          <button 
            onClick={scrollToInput}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold tracking-wider uppercase bg-white/10 hover:bg-white/15 text-white border border-white/15 transition-all shadow-lg hover:border-white/30"
          >
            Get Started
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* HERO SECTION */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 pt-16 pb-20 w-full flex flex-col items-center">
        {/* Main Title */}
        <div className="text-center space-y-4 max-w-3xl mx-auto">
          <h1 className="text-5xl sm:text-7xl font-extrabold tracking-tight text-white leading-none">
            Media Studio{" "}
            <span className="block mt-2 bg-gradient-to-r from-rose-500 via-amber-400 to-orange-500 bg-clip-text text-transparent">
              Agency.
            </span>
          </h1>
          <p className="text-sm sm:text-base text-slate-400 max-w-xl mx-auto font-light leading-relaxed">
            Next-gen decentralized media processing. Better data leads to higher performance formats. Zero compression loss and faster delivery.
          </p>
        </div>

        {/* Hero Interactive Grid & Badges */}
        <div className="w-full mt-12 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Left Badges */}
          <div className="hidden lg:flex lg:col-span-3 flex-col gap-6">
            <div className="glass-card glass-card-hover rounded-2xl p-5 border border-white/[0.08]">
              <span className="text-2xl font-black text-white block">240+</span>
              <span className="text-[11px] font-semibold tracking-wider uppercase text-slate-400">Supported Formats</span>
            </div>
            <div className="glass-card glass-card-hover rounded-2xl p-5 border border-white/[0.08]">
              <span className="text-2xl font-black text-rose-400 block">92%</span>
              <span className="text-[11px] font-semibold tracking-wider uppercase text-slate-400">Faster FFmpeg Pipeline</span>
            </div>
          </div>

          {/* Central Downloader Card */}
          <div ref={inputSectionRef} className="lg:col-span-6 w-full">
            <div className="relative p-1 rounded-3xl bg-gradient-to-b from-white/15 via-white/5 to-transparent shadow-2xl">
              <div className="glass-card rounded-[22px] p-6 sm:p-8 backdrop-blur-2xl bg-[#11131c]/90 border border-white/10 shadow-2xl">
                
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">Fast Stream Engine</span>
                  </div>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-white/5 border border-white/10 text-slate-400">
                    v2.4 Online
                  </span>
                </div>

                {/* Form */}
                <form onSubmit={handleInspect} className="space-y-4">
                  <div className="relative">
                    <input
                      type="text"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="Paste YouTube or Shorts URL here..."
                      className="w-full bg-[#08090e] border border-white/15 rounded-2xl px-5 py-4 pl-5 pr-28 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition-all shadow-inner"
                    />
                    <button
                      type="button"
                      onClick={handlePaste}
                      className="absolute right-3 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs text-white font-medium flex items-center gap-1.5 transition-colors border border-white/15 cursor-pointer"
                    >
                      <Clipboard className="w-3.5 h-3.5 text-amber-400" />
                      Paste
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={loading || !url.trim()}
                    className="w-full py-4 rounded-2xl bg-white text-black hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed font-extrabold text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-2xl shadow-white/20 transition-all cursor-pointer"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-black" />
                        Inspecting Streams...
                      </>
                    ) : (
                      <>
                        Inspect &amp; Fetch Video
                        <ArrowUpRight className="w-4 h-4 text-black" />
                      </>
                    )}
                  </button>
                </form>

                {/* Error Banner */}
                {error && (
                  <div className="mt-4 p-4 rounded-2xl bg-rose-950/40 border border-rose-500/40 text-rose-200 text-xs flex items-start gap-3">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Floating Card */}
          <div className="hidden lg:flex lg:col-span-3 flex-col gap-6">
            <div className="glass-card glass-card-hover rounded-2xl p-6 border border-white/[0.08] space-y-4">
              <p className="text-xs text-slate-300 leading-relaxed">
                Better audio-visual data leads to high-resolution outputs. Performant lossless models lead to faster download.
              </p>
              <button 
                onClick={scrollToInput}
                className="w-full py-2.5 rounded-full bg-white text-black font-extrabold text-xs tracking-wider uppercase hover:bg-slate-200 transition-all shadow-md"
              >
                Get Started
              </button>
            </div>
          </div>
        </div>

        {/* Video Preview & Download Card (Appears after inspect) */}
        {videoData && (
          <div className="w-full max-w-4xl mt-10 animate-in fade-in slide-in-from-bottom-6 duration-500">
            <div className="glass-card rounded-3xl p-6 sm:p-8 border border-white/15 shadow-2xl space-y-6">
              
              {/* Thumbnail & Metadata */}
              <div className="flex flex-col md:flex-row gap-6 items-start">
                <div className="relative rounded-2xl overflow-hidden bg-black/60 border border-white/10 shrink-0 w-full md:w-72 aspect-video shadow-xl">
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
                    <div className="absolute bottom-2.5 right-2.5 px-2 py-0.5 rounded-md bg-black/80 backdrop-blur-md text-[11px] font-mono text-white flex items-center gap-1 border border-white/10">
                      <Clock className="w-3 h-3 text-amber-400" />
                      {videoData.duration_formatted}
                    </div>
                  )}
                  {videoData.is_short && (
                    <div className="absolute top-2.5 left-2.5 px-2.5 py-0.5 rounded-md bg-rose-600 text-[10px] font-bold text-white tracking-wider uppercase shadow-lg">
                      Shorts
                    </div>
                  )}
                </div>

                <div className="flex-1 space-y-3">
                  <h3 className="text-lg sm:text-xl font-extrabold text-white leading-snug line-clamp-2">
                    {videoData.title}
                  </h3>
                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400">
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
                    <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Streams Verified
                    </span>
                  </div>
                </div>
              </div>

              {/* Quality & Format Selection */}
              <div className="border-t border-white/10 pt-6 space-y-3">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Select Format &amp; Resolution:
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
                            ? "bg-rose-500/15 border-rose-500 text-white shadow-lg shadow-rose-500/10"
                            : "bg-white/[0.03] border-white/10 text-slate-300 hover:border-white/20 hover:bg-white/[0.06]"
                        } ${downloading ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-8 h-8 rounded-xl flex items-center justify-center ${
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
                            <p className="text-xs font-bold text-white">{opt.label}</p>
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

              {/* Action / Progress View */}
              <div className="border-t border-white/10 pt-6">
                {!jobStatus || jobStatus.status === "failed" ? (
                  <button
                    type="button"
                    onClick={handleStartDownload}
                    disabled={downloading || !selectedOption}
                    className="w-full py-4 rounded-2xl bg-gradient-to-r from-rose-500 via-orange-500 to-amber-500 hover:opacity-95 disabled:opacity-40 text-white font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-2xl shadow-rose-500/30 transition-all cursor-pointer"
                  >
                    {downloading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Merging &amp; Encoding Streams...
                      </>
                    ) : (
                      <>
                        <Download className="w-5 h-5" />
                        Download {selectedOption?.label}
                      </>
                    )}
                  </button>
                ) : jobStatus.status === "completed" ? (
                  <div className="space-y-4">
                    <div className="p-5 rounded-2xl bg-emerald-950/30 border border-emerald-500/40 flex flex-col sm:flex-row items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 flex items-center justify-center text-emerald-400 border border-emerald-500/30">
                          <CheckCircle2 className="w-6 h-6" />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-white">
                            File Encoded &amp; Ready!
                          </h4>
                          <p className="text-xs text-slate-400">
                            {jobStatus.filename} &bull; {formatFileSize(jobStatus.file_size)}
                          </p>
                        </div>
                      </div>
                      <a
                        href={`${BACKEND_URL}/jobs/${activeJobId}/download`}
                        download
                        className="w-full sm:w-auto px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xs tracking-wider uppercase flex items-center justify-center gap-2 shadow-xl shadow-emerald-500/30 transition-all"
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
                      className="text-xs text-slate-400 hover:text-white flex items-center gap-1.5 mx-auto transition-colors"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Convert another resolution
                    </button>
                  </div>
                ) : (
                  /* Live Progress Bar */
                  <div className="p-5 rounded-2xl bg-black/60 border border-white/10 space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-200 flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                        Processing &amp; Merging Media Streams...
                      </span>
                      <span className="font-mono text-amber-400 font-bold">
                        {jobStatus.progress}%
                      </span>
                    </div>

                    <div className="w-full h-3 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-rose-500 via-orange-500 to-amber-400 transition-all duration-300 ease-out"
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
        )}
      </section>

      {/* HORIZONTAL MARQUEE TICKER (Matching Reference Image) */}
      <div className="w-full border-y border-white/[0.08] bg-[#0c0d14]/70 backdrop-blur-md py-4 overflow-hidden relative">
        <div className="animate-marquee whitespace-nowrap flex items-center text-xs font-bold uppercase tracking-widest text-slate-300">
          {[...TICKER_ITEMS, ...TICKER_ITEMS, ...TICKER_ITEMS].map((item, idx) => (
            <span key={idx} className="flex items-center mx-6">
              <span className="text-amber-400 mr-4 font-normal">✦</span>
              {item}
            </span>
          ))}
        </div>
      </div>

      {/* SECTION: OUR SERVICES / CAPABILITIES */}
      <section id="services" className="max-w-7xl mx-auto px-6 py-24 w-full">
        <div className="text-center mb-16 space-y-3">
          <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
            Our Services
          </h2>
          <p className="text-slate-400 text-sm max-w-md mx-auto">
            High performance pipelines designed for content creators, archivists and power users.
          </p>
        </div>

        {/* Feature Showcase Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Left Text / Bullets */}
          <div className="lg:col-span-6 space-y-6">
            <h3 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
              Lossless Media Processing
            </h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              Hands-on media workflow via real-time processing engine. High-bitrate audio stream extraction, multi-resolution adaptive downloads, and zero loss encoding.
            </p>

            <ul className="space-y-3 pt-2">
              {[
                "1080p & 4K High Resolution Video Streams",
                "Crystal Clear 320 kbps MP3 Audio Extraction",
                "Full YouTube Shorts & Mobile Aspect Compatibility",
                "Instant Server-Sent Progress Event Streaming"
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
                className="px-6 py-3 rounded-full text-xs font-bold uppercase tracking-wider bg-white/10 hover:bg-white/15 text-white border border-white/20 transition-all flex items-center gap-2"
              >
                Learn More
                <ArrowUpRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Right Visual UI Mockup Card (Like Screenshot) */}
          <div className="lg:col-span-6">
            <div className="relative p-1 rounded-3xl bg-gradient-to-tr from-rose-500/30 via-amber-500/20 to-purple-500/30">
              <div className="glass-card rounded-[22px] p-8 bg-[#0e1017]/95 border border-white/15 shadow-2xl space-y-6">
                
                {/* Simulated UI Window */}
                <div className="flex items-center justify-between border-b border-white/10 pb-4">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-rose-500"></span>
                    <span className="w-3 h-3 rounded-full bg-amber-500"></span>
                    <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
                  </div>
                  <span className="text-xs font-mono text-slate-400">pipeline://render-engine</span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-white/[0.04] border border-white/10 space-y-2">
                    <Zap className="w-5 h-5 text-amber-400" />
                    <h5 className="text-xs font-bold text-white uppercase">Fast Encoding</h5>
                    <p className="text-[11px] text-slate-400">FFmpeg 9.0 multi-threaded video stream multiplexing.</p>
                  </div>
                  <div className="p-4 rounded-xl bg-white/[0.04] border border-white/10 space-y-2">
                    <Layers className="w-5 h-5 text-rose-400" />
                    <h5 className="text-xs font-bold text-white uppercase">Multi-Format</h5>
                    <p className="text-[11px] text-slate-400">Dynamic format mapping for both video and audio.</p>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-gradient-to-r from-rose-500/10 via-amber-500/10 to-transparent border border-white/10 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Sliders className="w-5 h-5 text-rose-400" />
                    <div>
                      <p className="text-xs font-bold text-white">Dynamic Stream Bitrate</p>
                      <p className="text-[10px] text-slate-400 font-mono">Max Quality: 320 kbps / 60 FPS</p>
                    </div>
                  </div>
                  <span className="text-xs font-black text-emerald-400">ACTIVE</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* METRICS & STATS SECTION (Matching Reference Image) */}
      <section id="stats" className="border-t border-white/[0.07] bg-[#0a0c12]/80 backdrop-blur-xl py-16">
        <div className="max-w-6xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          <div className="space-y-1">
            <h4 className="text-3xl sm:text-5xl font-black text-white tracking-tight">5M+</h4>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Processed Media</p>
          </div>
          <div className="space-y-1">
            <h4 className="text-3xl sm:text-5xl font-black text-white tracking-tight">450M+</h4>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Bitrate Streamed</p>
          </div>
          <div className="space-y-1">
            <h4 className="text-3xl sm:text-5xl font-black text-rose-400 tracking-tight">99.9%</h4>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Uptime Rate</p>
          </div>
          <div className="space-y-1">
            <h4 className="text-3xl sm:text-5xl font-black text-amber-400 tracking-tight">0.8s</h4>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Avg Stream Fetch</p>
          </div>
        </div>
      </section>

      {/* TESTIMONIALS / HAPPY USERS HEADER */}
      <section className="py-20 text-center space-y-4">
        <h3 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
          Our Happy Customers
        </h3>
        <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto">
          Trusted by video editors, researchers, educators, and creators worldwide.
        </p>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-white/[0.08] bg-[#07080c] py-8 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>&copy; 2026 WE03 Studio &bull; Built for high-speed media conversion.</p>
          <div className="flex gap-6 text-slate-400">
            <a href="#" className="hover:text-white transition-colors">Privacy</a>
            <a href="#" className="hover:text-white transition-colors">Terms</a>
            <a href="#" className="hover:text-white transition-colors">API</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
