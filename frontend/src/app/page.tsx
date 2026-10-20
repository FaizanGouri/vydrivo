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
  AlertCircle,
  Camera,
  Image as ImageIcon
} from "lucide-react";

interface MediaOption {
  quality: string;
  height?: number;
  format: string;
  label: string;
  type: "video" | "audio" | "image";
  url?: string;
}

interface VideoData {
  id: string;
  url: string;
  title: string;
  thumbnail: string;
  duration_formatted?: string;
  uploader?: string;
  view_count?: number;
  platform?: "youtube" | "instagram" | "facebook" | "pinterest";
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

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1";

const TAB_ORDER = ["youtube", "instagram", "facebook", "pinterest"] as const;
type PlatformTab = typeof TAB_ORDER[number];

function FacebookIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

function PinterestIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.373 0 0 5.372 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738.098.119.112.224.083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.631-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12 0-6.628-5.373-12-12-12z" />
    </svg>
  );
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<PlatformTab>("youtube");
  const [tabDirection, setTabDirection] = useState<"left" | "right">("right");
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [videoData, setVideoData] = useState<VideoData | null>(null);

  // Sticky tab slider position & stretch animation
  const tabContainerRef = useRef<HTMLDivElement | null>(null);
  const tabRefs = useRef<{ [key in PlatformTab]?: HTMLButtonElement | null }>({});
  const [pillStyle, setPillStyle] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
    ready: boolean;
  }>({ left: 0, top: 0, width: 0, height: 0, ready: false });
  const [isStretching, setIsStretching] = useState(false);

  const updatePill = () => {
    if (typeof window === "undefined") return;
    const container = tabContainerRef.current;
    const button = tabRefs.current[activeTab];
    if (container && button && window.innerWidth >= 640) {
      const cRect = container.getBoundingClientRect();
      const bRect = button.getBoundingClientRect();
      setPillStyle({
        left: bRect.left - cRect.left,
        top: bRect.top - cRect.top,
        width: bRect.width,
        height: bRect.height,
        ready: true,
      });
    } else {
      setPillStyle((prev) => (prev.ready ? { ...prev, ready: false } : prev));
    }
  };

  useEffect(() => {
    updatePill();
    setIsStretching(true);
    const t = setTimeout(() => setIsStretching(false), 380);
    const onResize = () => updatePill();
    window.addEventListener("resize", onResize);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", onResize);
    };
  }, [activeTab]);

  const activePillBg =
    activeTab === "youtube"
      ? "bg-white shadow-[0_4px_16px_rgba(255,255,255,0.3)]"
      : activeTab === "instagram"
      ? "bg-gradient-to-r from-[#fdc468] via-[#df4996] to-[#4f5bd5] shadow-[0_4px_16px_rgba(223,73,150,0.35)]"
      : activeTab === "facebook"
      ? "bg-[#1877f2] shadow-[0_4px_16px_rgba(24,119,242,0.35)]"
      : "bg-[#e60023] shadow-[0_4px_16px_rgba(230,0,35,0.35)]";

  const switchTab = (tab: PlatformTab) => {
    if (tab === activeTab) return;
    const oldIdx = TAB_ORDER.indexOf(activeTab);
    const newIdx = TAB_ORDER.indexOf(tab);
    setTabDirection(newIdx > oldIdx ? "right" : "left");
    setActiveTab(tab);
    setUrl("");
    setVideoData(null);
    setError(null);
    setMsg(null);
    setJobStatus(null);
    setActiveJobId(null);
  };
  
  // Selection state
  const [selectedOption, setSelectedOption] = useState<MediaOption | null>(null);

  // Job & Progress state
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [downloading, setDownloading] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Clean up SSE and polling on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
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
      setError(
        activeTab === "youtube"
          ? "Please paste a valid YouTube video or Shorts link."
          : activeTab === "instagram"
          ? "Please paste a valid Instagram Reel or Post link."
          : activeTab === "facebook"
          ? "Please paste a valid Facebook Video, Reel, or Post link."
          : "Please paste a valid Pinterest Pin or Video link."
      );
      setMsg(null);
      return;
    }

    setLoading(true);
    setError(null);
    setMsg(
      activeTab === "youtube"
        ? "Link looks good. Fetching video details…"
        : activeTab === "instagram"
        ? "Link looks good. Fetching Instagram media details…"
        : activeTab === "facebook"
        ? "Link looks good. Fetching Facebook media details…"
        : "Link looks good. Fetching Pinterest media details…"
    );
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

      const stopAll = () => {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
          eventSourceRef.current = null;
        }
      };

      stopAll();

      const startFallbackPolling = () => {
        if (pollIntervalRef.current) return;
        pollIntervalRef.current = setInterval(async () => {
          try {
            const checkRes = await fetch(`${BACKEND_URL}/jobs/${jobId}`);
            if (checkRes.ok) {
              const data: JobStatus = await checkRes.json();
              setJobStatus(data);
              if (data.status === "completed") {
                setDownloading(false);
                stopAll();
              } else if (data.status === "failed") {
                setDownloading(false);
                setError(data.error || "Download processing failed.");
                stopAll();
              } else if (data.status === "cancelled") {
                setDownloading(false);
                setError("Download was cancelled.");
                stopAll();
              }
            }
          } catch {
            // ignore network glitch
          }
        }, 1200);
      };

      // Connect primary SSE live stream
      try {
        const sse = new EventSource(`${BACKEND_URL}/jobs/${jobId}/events`);
        eventSourceRef.current = sse;

        sse.onmessage = (event) => {
          try {
            const data: JobStatus = JSON.parse(event.data);
            setJobStatus(data);

            if (data.status === "completed") {
              setDownloading(false);
              stopAll();
            } else if (data.status === "failed") {
              setDownloading(false);
              setError(data.error || "Download processing failed.");
              stopAll();
            } else if (data.status === "cancelled") {
              setDownloading(false);
              setError("Download was cancelled.");
              stopAll();
            }
          } catch {
            // SSE ping heartbeat
          }
        };

        sse.onerror = () => {
          // Fall back gracefully to polling only if SSE connection drops
          startFallbackPolling();
        };
      } catch {
        startFallbackPolling();
      }
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

      <main className="stage relative w-full min-h-screen bg-[radial-gradient(120%_90%_at_50%_40%,#56a371_0%,#3f8a5a_45%,#2f6e48_100%)] overflow-hidden px-4 sm:px-8 md:px-14 lg:px-20 pt-6 sm:pt-8 pb-6 sm:pb-8 flex flex-col justify-between">
      {/* Top Navigation with Mobile 2x2 Grid & Desktop Sliding Pill Selector */}
      <nav className="relative z-10 flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4 w-full">
        <div className="flex items-center justify-between w-full sm:w-auto">
          <a 
            className="font-bold text-[22px] sm:text-[24px] tracking-[-0.01em] text-white flex items-center gap-1.5" 
            href="#"
            onClick={(e) => { e.preventDefault(); switchTab("youtube"); }}
          >
            vydrivo<span className="text-[#f2b632]">.</span>
          </a>
        </div>

        {/* Mobile Platform Selector (Clean 2x2 Responsive Grid with >=44px Tap Targets) */}
        <div className="grid grid-cols-2 gap-2 p-1.5 rounded-2xl bg-white/[0.16] border border-white/[0.35] backdrop-blur-md shadow-inner w-full sm:hidden">
          <button
            type="button"
            onClick={() => switchTab("youtube")}
            className={`min-h-[46px] px-3 py-2 rounded-xl text-[13px] font-semibold transition-all duration-200 cursor-pointer flex items-center justify-center gap-2 ${
              activeTab === "youtube"
                ? "bg-white text-[#1f2a24] shadow-md font-bold"
                : "bg-white/[0.08] text-white/90 hover:bg-white/[0.16]"
            }`}
          >
            <Play className={`w-4 h-4 ${activeTab === "youtube" ? "fill-red-600 text-red-600" : ""}`} />
            YouTube
          </button>

          <button
            type="button"
            onClick={() => switchTab("instagram")}
            className={`min-h-[46px] px-3 py-2 rounded-xl text-[13px] font-semibold transition-all duration-200 cursor-pointer flex items-center justify-center gap-2 ${
              activeTab === "instagram"
                ? "bg-gradient-to-r from-[#fdc468] via-[#df4996] to-[#4f5bd5] text-white shadow-md font-bold"
                : "bg-white/[0.08] text-white/90 hover:bg-white/[0.16]"
            }`}
          >
            <Camera className="w-4 h-4" />
            Instagram
          </button>

          <button
            type="button"
            onClick={() => switchTab("facebook")}
            className={`min-h-[46px] px-3 py-2 rounded-xl text-[13px] font-semibold transition-all duration-200 cursor-pointer flex items-center justify-center gap-2 ${
              activeTab === "facebook"
                ? "bg-[#1877f2] text-white shadow-md font-bold"
                : "bg-white/[0.08] text-white/90 hover:bg-white/[0.16]"
            }`}
          >
            <FacebookIcon className="w-4 h-4" />
            Facebook
          </button>

          <button
            type="button"
            onClick={() => switchTab("pinterest")}
            className={`min-h-[46px] px-3 py-2 rounded-xl text-[13px] font-semibold transition-all duration-200 cursor-pointer flex items-center justify-center gap-2 ${
              activeTab === "pinterest"
                ? "bg-[#e60023] text-white shadow-md font-bold"
                : "bg-white/[0.08] text-white/90 hover:bg-white/[0.16]"
            }`}
          >
            <PinterestIcon className="w-4 h-4" />
            Pinterest
          </button>
        </div>

        {/* Desktop Platform Selector (Original Horizontal Pill Slider with Sticky Stretch Animation) */}
        <div 
          ref={tabContainerRef}
          className="relative hidden sm:flex items-center gap-1.5 p-1.5 rounded-full bg-white/[0.16] border border-white/[0.35] backdrop-blur-md shadow-inner"
        >
          {/* Animated Sticky Pill Slider Background */}
          {pillStyle.ready && (
            <div
              className={`absolute rounded-full pointer-events-none transition-all duration-380 ease-[cubic-bezier(0.34,1.45,0.64,1)] ${activePillBg} ${
                isStretching
                  ? tabDirection === "right"
                    ? "scale-x-[1.08] origin-left"
                    : "scale-x-[1.08] origin-right"
                  : "scale-x-100"
              }`}
              style={{
                left: `${pillStyle.left}px`,
                top: `${pillStyle.top}px`,
                width: `${pillStyle.width}px`,
                height: `${pillStyle.height}px`,
                zIndex: 0,
              }}
            />
          )}

          <button 
            ref={(el) => { tabRefs.current["youtube"] = el; }}
            type="button"
            onClick={() => switchTab("youtube")}
            className={`relative z-10 px-4 sm:px-5 py-2 sm:py-2.5 rounded-full text-[13px] sm:text-[14px] font-semibold transition-colors duration-200 cursor-pointer flex items-center gap-1.5 ${
              activeTab === "youtube"
                ? "text-[#1f2a24]"
                : "text-white hover:bg-white/10"
            }`}
          >
            <Play className={`w-3.5 h-3.5 transition-colors duration-300 ${activeTab === "youtube" ? "fill-red-600 text-red-600" : ""}`} />
            YouTube
          </button>

          <button 
            ref={(el) => { tabRefs.current["instagram"] = el; }}
            type="button"
            onClick={() => switchTab("instagram")}
            className={`relative z-10 px-4 sm:px-5 py-2 sm:py-2.5 rounded-full text-[13px] sm:text-[14px] font-semibold transition-colors duration-200 cursor-pointer flex items-center gap-1.5 ${
              activeTab === "instagram"
                ? "text-white font-bold"
                : "text-white hover:bg-white/10"
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            Instagram Reel / Image
          </button>

          <button 
            ref={(el) => { tabRefs.current["facebook"] = el; }}
            type="button"
            onClick={() => switchTab("facebook")}
            className={`relative z-10 px-4 sm:px-5 py-2 sm:py-2.5 rounded-full text-[13px] sm:text-[14px] font-semibold transition-colors duration-200 cursor-pointer flex items-center gap-1.5 ${
              activeTab === "facebook"
                ? "text-white font-bold"
                : "text-white hover:bg-white/10"
            }`}
          >
            <FacebookIcon className="w-3.5 h-3.5" />
            Facebook Video / Image
          </button>

          <button 
            ref={(el) => { tabRefs.current["pinterest"] = el; }}
            type="button"
            onClick={() => switchTab("pinterest")}
            className={`relative z-10 px-4 sm:px-5 py-2 sm:py-2.5 rounded-full text-[13px] sm:text-[14px] font-semibold transition-colors duration-200 cursor-pointer flex items-center gap-1.5 ${
              activeTab === "pinterest"
                ? "text-white font-bold"
                : "text-white hover:bg-white/10"
            }`}
          >
            <PinterestIcon className="w-3.5 h-3.5" />
            Pinterest Pin / Video
          </button>
        </div>
      </nav>

      {/* Hero Section (Centered Clean & Focused Downloader) */}
      <section className="relative z-10 flex-1 flex flex-col items-center justify-center text-center py-6 sm:py-10">
        
        <div 
          key={activeTab}
          className={`w-full max-w-[720px] flex flex-col items-center justify-center ${
            tabDirection === "right" ? "tab-slide-right" : "tab-slide-left"
          }`}
        >
          {/* Centered Floating Badge with Aligned Background Watermark */}
          <div className="relative inline-flex items-center justify-center mb-4 sm:mb-5">
            {/* Background Big Watermark Title Centered on Badge (Shifted 50px upward) */}
            <div 
              aria-hidden="true" 
              className="floating-watermark pointer-events-none select-none absolute left-1/2 top-[calc(50%-50px)] text-[clamp(82px,22vw,140px)] sm:text-[clamp(120px,18vw,250px)] font-[800] tracking-[0.01em] leading-none whitespace-nowrap bg-gradient-to-b from-[#d4f8e0]/60 via-[#a3e8ba]/35 to-transparent sm:from-white/60 sm:via-white/30 sm:to-transparent bg-clip-text text-transparent -z-10"
            >
              VYDRIVO
            </div>

            <div className="floating-badge inline-flex items-center gap-2.5 sm:gap-3 py-1.5 sm:py-2 pl-1.5 sm:pl-2 pr-4 sm:pr-5 rounded-full bg-white/[0.18] border border-white/[0.35] shadow-lg backdrop-blur-md">
              <i className="w-[30px] sm:w-[34px] h-[30px] sm:h-[34px] rounded-full bg-[#f2b632] text-[#1f2a24] grid place-items-center font-bold text-sm sm:text-base shrink-0 not-italic">
                ✓
              </i>
              <div className="text-left">
                <b className="block text-[#f2b632] text-[15px] sm:text-[17px] leading-tight font-extrabold">
                  {activeTab === "youtube"
                    ? "+10 lakh"
                    : activeTab === "instagram"
                    ? "+5 lakh"
                    : activeTab === "facebook"
                    ? "+8 lakh"
                    : "+6 lakh"}
                </b>
                <small className="text-[9px] sm:text-[10px] tracking-[0.06em] text-white/80 uppercase font-semibold">
                  {activeTab === "youtube"
                    ? "VIDEOS SAVED"
                    : activeTab === "instagram"
                    ? "REELS & POSTS SAVED"
                    : activeTab === "facebook"
                    ? "CLIPS & POSTS SAVED"
                    : "PINS & PHOTOS SAVED"}
                </small>
              </div>
            </div>
          </div>

          <h1 className="text-[clamp(28px,6vw,58px)] leading-[1.12] sm:leading-[1.08] font-bold tracking-[-0.02em] text-white max-w-[20ch] px-1 sm:px-0">
            {activeTab === "youtube"
              ? "Save any video you love"
              : activeTab === "instagram"
              ? "Save any Instagram Reel or Image"
              : activeTab === "facebook"
              ? "Save any Facebook Video or Post"
              : "Save any Pinterest Pin or Video"}
          </h1>

          <p className="mt-2 sm:mt-3 italic font-light text-[17px] sm:text-[20px] md:text-[22px] text-white/90 max-w-[34ch] sm:max-w-none">
            {activeTab === "youtube"
              ? "paste the link, pick a format, done"
              : activeTab === "instagram"
              ? "paste the reel or post link, download instantly"
              : activeTab === "facebook"
              ? "paste the facebook link, download in HD instantly"
              : "paste the pin link, download in full resolution"}
          </p>

          <p className="mt-3 sm:mt-4 max-w-[50ch] text-[14px] sm:text-[15px] md:text-[16px] leading-relaxed text-white/90 px-1 sm:px-0">
            {activeTab === "youtube"
              ? "Fast, simple and free. Choose MP4 for video or MP3 for audio, in the quality that suits your phone or laptop."
              : activeTab === "instagram"
              ? "Download Instagram Reels in HD MP4, save high-resolution cover photos/images, or extract audio directly."
              : activeTab === "facebook"
              ? "Download Facebook Watch, Reels, and public post videos in HD MP4, save high-res images, or extract MP3 audio."
              : "Download Pinterest videos, Idea Pins, and aesthetic high-resolution photos/wallpapers in original quality."}
          </p>

          {/* Input Box Form */}
          <form 
            onSubmit={handleInspect} 
            className="mt-6 sm:mt-8 flex flex-col sm:flex-row gap-2 p-2 sm:p-1.5 rounded-2xl sm:rounded-full bg-white/[0.96] w-full max-w-[560px] shadow-[0_16px_35px_-12px_rgba(0,0,0,0.4)] focus-within:ring-3 focus-within:ring-[#f2b632] transition-all"
          >
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={
                activeTab === "youtube"
                  ? "Paste YouTube video or Shorts link here"
                  : activeTab === "instagram"
                  ? "Paste Instagram Reel or Post URL here (e.g. instagram.com/reel/...)"
                  : activeTab === "facebook"
                  ? "Paste Facebook Video, Reel, or Post URL here (e.g. fb.watch/... or facebook.com/...)"
                  : "Paste Pinterest Pin or Video URL here (e.g. pin.it/... or pinterest.com/pin/...)"
              }
              className="w-full flex-1 min-w-0 border-0 bg-transparent px-4 sm:px-5 py-3 sm:py-2.5 font-medium text-[14.5px] sm:text-[16px] text-[#1f2a24] placeholder-[#7d8d83] focus:outline-none min-h-[44px]"
            />
            <button 
              type="submit" 
              disabled={loading}
              className={`w-full sm:w-auto border-0 cursor-pointer font-semibold text-[15px] px-7 sm:px-8 py-3 sm:py-3.5 min-h-[46px] rounded-xl sm:rounded-full text-white transition-all transform hover:-translate-y-0.5 active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2 shadow-md shrink-0 ${
                activeTab === "instagram"
                  ? "bg-gradient-to-r from-[#df4996] to-[#4f5bd5] hover:opacity-95"
                  : activeTab === "facebook"
                  ? "bg-[#1877f2] hover:bg-[#166fe5]"
                  : activeTab === "pinterest"
                  ? "bg-[#e60023] hover:bg-[#ad081b]"
                  : "bg-[#1f2a24] hover:bg-[#0f1612]"
              }`}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Download"}
            </button>
          </form>

          {/* Feedback Messages */}
          {msg && <p className="mt-3 sm:mt-4 text-[13.5px] sm:text-[14px] text-white font-medium">{msg}</p>}
          {error && <p className="mt-3 sm:mt-4 text-[13.5px] sm:text-[14px] text-[#ffe29a] font-medium flex items-center justify-center gap-1.5 px-2"><AlertCircle className="w-4 h-4 shrink-0" /><span>{error}</span></p>}
        </div>
      </section>

      {/* Dynamic Video Preview / Processing Modal / Drawer if video is fetched */}
      {videoData && (
        <section className="relative z-20 mt-6 sm:mt-8 p-4 sm:p-6 rounded-[20px] sm:rounded-[22px] bg-[#f3f8f1] text-[#1f2a24] shadow-2xl animate-in fade-in slide-in-from-bottom-6 w-full max-w-[850px] mx-auto">
          <div className="flex flex-col md:flex-row gap-4 sm:gap-5 items-start justify-between">
            
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
            <div className="flex-1 w-full space-y-2 text-left">
              <h2 className="text-base sm:text-lg font-bold text-[#1f2a24] leading-snug line-clamp-2 break-words">
                {videoData.title}
              </h2>
              <div className="flex flex-wrap items-center gap-3 text-xs text-[#53665a]">
                {videoData.uploader && (
                  <span className="flex items-center gap-1 font-medium">
                    <User className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate max-w-[200px]">{videoData.uploader}</span>
                  </span>
                )}
                {videoData.view_count && (
                  <span className="flex items-center gap-1 font-medium">
                    <Eye className="w-3.5 h-3.5 shrink-0" />
                    {formatViews(videoData.view_count)}
                  </span>
                )}
              </div>

              {/* Quality selector buttons */}
              <div className="pt-2">
                <p className="text-xs font-bold text-[#1f2a24] uppercase tracking-wider mb-2">Available Options:</p>
                <div className="flex flex-wrap gap-1.5 sm:gap-2">
                  {videoData.options.map((opt, idx) => {
                    const isSelected = selectedOption?.quality === opt.quality && selectedOption?.type === opt.type;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setSelectedOption(opt)}
                        disabled={downloading}
                        className={`px-3 py-2 sm:py-1.5 rounded-full text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1.5 min-h-[38px] ${
                          isSelected
                            ? "bg-[#3f8a5a] text-white border-[#3f8a5a] shadow-sm"
                            : "bg-white text-[#1f2a24] border-slate-300 hover:border-[#3f8a5a]"
                        }`}
                      >
                        {opt.type === "audio" ? (
                          <Music className="w-3 h-3 shrink-0" />
                        ) : opt.type === "image" ? (
                          <ImageIcon className="w-3 h-3 shrink-0" />
                        ) : (
                          <Play className="w-3 h-3 shrink-0" />
                        )}
                        <span className="truncate max-w-[240px]">{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Download Button / Progress */}
            <div className="w-full md:w-64 shrink-0 flex flex-col justify-center pt-2 md:pt-0">
              {!jobStatus || jobStatus.status === "failed" ? (
                <button
                  type="button"
                  onClick={handleStartDownload}
                  disabled={downloading || !selectedOption}
                  className="w-full py-3.5 min-h-[46px] rounded-xl sm:rounded-full bg-[#f2b632] hover:bg-[#e0a72c] active:scale-[0.99] text-[#1f2a24] font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
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
                    className="w-full py-3.5 min-h-[46px] rounded-xl sm:rounded-full bg-[#3f8a5a] hover:bg-[#2f6e48] text-white font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2"
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
                    className="text-xs text-[#53665a] hover:text-[#1f2a24] inline-flex items-center gap-1 mt-1 cursor-pointer min-h-[36px] px-2"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Pick another format
                  </button>
                </div>
              ) : (
                /* In Progress */
                <div className="p-3.5 rounded-xl bg-white border border-slate-200 space-y-2 shadow-sm animate-in fade-in">
                  <div className="flex items-center justify-between text-xs font-bold text-[#1f2a24]">
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[#3f8a5a]" />
                      {jobStatus.progress >= 99
                        ? "Finalizing file..."
                        : selectedOption?.type === "audio"
                        ? "Extracting audio..."
                        : selectedOption?.type === "image"
                        ? "Saving image..."
                        : "Downloading media..."}
                    </span>
                    <span>{Math.round(jobStatus.progress)}%</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full bg-[#3f8a5a] transition-all duration-300"
                      style={{ width: `${Math.max(jobStatus.progress, 5)}%` }}
                    />
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono text-center flex items-center justify-center gap-2">
                    {jobStatus.speed ? <span>{jobStatus.speed}</span> : null}
                    {jobStatus.eta ? <span>• ETA: {jobStatus.eta}</span> : null}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="relative z-10 mt-6 pt-4 border-t border-white/[0.18] flex flex-col sm:flex-row justify-between items-center gap-2 sm:gap-3 text-center sm:text-left text-[11.5px] sm:text-[12.5px] text-white/75" id="contact">
        <span>&copy; 2026 VYDRIVO. All rights reserved.</span>
        <span>Download only content you own or have permission to save.</span>
      </footer>
    </main>
  </>
);
}
