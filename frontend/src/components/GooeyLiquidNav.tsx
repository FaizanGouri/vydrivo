"use client";

import React, { useEffect, useRef, useState } from "react";
import { Play, Camera, ArrowRight } from "lucide-react";

export type PlatformTab = "youtube" | "instagram" | "facebook" | "pinterest";

interface GooeyLiquidNavProps {
  activeTab: PlatformTab;
  onTabChange: (tab: PlatformTab) => void;
  direction?: "left" | "right";
}

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

const TABS: {
  id: PlatformTab;
  label: string;
  icon: (active: boolean) => React.ReactNode;
  bgGradient: string;
}[] = [
  {
    id: "youtube",
    label: "YouTube",
    icon: (active) => (
      <Play
        className={`w-3.5 h-3.5 transition-colors duration-300 ${
          active ? "fill-red-600 text-red-600" : "fill-white/80 text-white/80"
        }`}
      />
    ),
    bgGradient: "bg-[#18231c]",
  },
  {
    id: "instagram",
    label: "Instagram",
    icon: (active) => (
      <Camera
        className={`w-3.5 h-3.5 transition-colors duration-300 ${
          active ? "text-[#df4996]" : "text-white/80"
        }`}
      />
    ),
    bgGradient: "bg-gradient-to-r from-[#2a1727] via-[#21162d] to-[#161a33]",
  },
  {
    id: "facebook",
    label: "Facebook",
    icon: (active) => (
      <FacebookIcon
        className={`w-3.5 h-3.5 transition-colors duration-300 ${
          active ? "text-[#1877f2]" : "text-white/80"
        }`}
      />
    ),
    bgGradient: "bg-[#101b2a]",
  },
  {
    id: "pinterest",
    label: "Pinterest",
    icon: (active) => (
      <PinterestIcon
        className={`w-3.5 h-3.5 transition-colors duration-300 ${
          active ? "text-[#e60023]" : "text-white/80"
        }`}
      />
    ),
    bgGradient: "bg-[#251216]",
  },
];

export default function GooeyLiquidNav({
  activeTab,
  onTabChange,
  direction = "right",
}: GooeyLiquidNavProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const tabButtonRefs = useRef<{ [key in PlatformTab]?: HTMLButtonElement | null }>({});
  
  const [pillBounds, setPillBounds] = useState<{
    left: number;
    width: number;
    height: number;
    ready: boolean;
  }>({
    left: 0,
    width: 0,
    height: 0,
    ready: false,
  });

  const [isAnimating, setIsAnimating] = useState(false);

  // Recalculate indicator position when activeTab or screen size changes
  const updatePosition = () => {
    const container = containerRef.current;
    const button = tabButtonRefs.current[activeTab];
    if (!container || !button) return;

    const cRect = container.getBoundingClientRect();
    const bRect = button.getBoundingClientRect();

    setPillBounds({
      left: bRect.left - cRect.left,
      width: bRect.width,
      height: bRect.height,
      ready: true,
    });
  };

  useEffect(() => {
    updatePosition();
    setIsAnimating(true);
    const timer = setTimeout(() => setIsAnimating(false), 450);

    const handleResize = () => updatePosition();
    window.addEventListener("resize", handleResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", handleResize);
    };
  }, [activeTab]);

  const activeTabConfig = TABS.find((t) => t.id === activeTab) || TABS[0];

  return (
    <div className="relative inline-flex items-center">
      {/* Hidden SVG Filter for Real Gooey / Fluid Melting effect */}
      <svg className="absolute w-0 h-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <defs>
          <filter id="liquid-goo-filter" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="4.5" result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -8"
              result="goo"
            />
            <feComposite in="SourceGraphic" in2="goo" operator="atop" />
          </filter>
        </defs>
      </svg>

      {/* Outer Rounded Capsule Track (matching reference image) */}
      <div
        ref={containerRef}
        className="relative flex items-center p-1.5 sm:p-2 rounded-full bg-[#1b251f]/85 border-2 border-white/25 backdrop-blur-xl shadow-[0_12px_32px_rgba(0,0,0,0.35)] select-none"
      >
        {/* Animated Liquid Gooey Slider Highlight */}
        {pillBounds.ready && (
          <div
            className="absolute top-1.5 sm:top-2 pointer-events-none transition-all duration-400 ease-[cubic-bezier(0.34,1.4,0.64,1)]"
            style={{
              left: `${pillBounds.left}px`,
              width: `${pillBounds.width}px`,
              height: `${pillBounds.height}px`,
              zIndex: 1,
            }}
          >
            {/* Liquid Background with Gooey SVG Filter */}
            <div
              className="absolute inset-0 flex items-center justify-between pointer-events-none"
              style={{ filter: "url(#liquid-goo-filter)" }}
            >
              {/* Main Pill Body Blob */}
              <div
                className={`h-full w-full rounded-full transition-colors duration-400 border border-white/20 shadow-inner ${
                  activeTabConfig.bgGradient
                } ${isAnimating ? (direction === "right" ? "scale-x-[1.05] origin-left" : "scale-x-[1.05] origin-right") : "scale-x-100"}`}
              />

              {/* Gooey Connector Droplet Blob extending toward the circle knob */}
              <div
                className={`w-6 h-6 rounded-full -mr-2 transition-transform duration-300 ${
                  activeTabConfig.bgGradient
                } ${isAnimating ? "scale-110" : "scale-90"}`}
              />

              {/* Circle Bulb Background Blob */}
              <div
                className={`w-8 h-8 rounded-full shrink-0 -mr-1 transition-transform duration-300 ${
                  activeTabConfig.bgGradient
                } ${isAnimating ? "scale-105" : "scale-100"}`}
              />
            </div>

            {/* Crisp Foreground Overlay: Outer pinched border silhouette & Circle knob with arrow */}
            <div className="absolute inset-0 flex items-center justify-end pr-1 pointer-events-none z-10">
              {/* The White Circular Button with Arrow Knob (Exact match to reference image) */}
              <div
                className={`w-6 sm:w-7 h-6 sm:h-7 rounded-full bg-white text-[#1f2a24] shadow-[0_2px_8px_rgba(0,0,0,0.3)] flex items-center justify-center transition-all duration-300 ${
                  isAnimating
                    ? direction === "right"
                      ? "translate-x-1 scale-105"
                      : "-translate-x-1 scale-105"
                    : "translate-x-0 scale-100 group-hover:translate-x-1"
                }`}
              >
                <ArrowRight
                  className={`w-3.5 sm:w-4 h-3.5 sm:h-4 stroke-[2.5] text-[#1b251f] transition-transform duration-300 ${
                    direction === "left" && isAnimating ? "rotate-180" : "rotate-0"
                  }`}
                />
              </div>
            </div>
          </div>
        )}

        {/* Tab Buttons */}
        <div className="relative z-10 flex items-center gap-1 sm:gap-2">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                ref={(el) => {
                  tabButtonRefs.current[tab.id] = el;
                }}
                type="button"
                onClick={() => onTabChange(tab.id)}
                className={`group relative px-3.5 sm:px-5 py-2 sm:py-2.5 rounded-full text-[12px] sm:text-[13.5px] font-bold tracking-wider uppercase transition-all duration-300 cursor-pointer flex items-center gap-2 select-none ${
                  isActive
                    ? "text-white pr-9 sm:pr-10" // Extra right padding so text doesn't overlap the attached circular arrow knob
                    : "text-white/75 hover:text-white hover:bg-white/[0.08]"
                }`}
              >
                {tab.icon(isActive)}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
