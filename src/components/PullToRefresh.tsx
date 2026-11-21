"use client";

import React, { useEffect, useRef } from "react";

export interface PullToRefreshProps {
  onRefresh: () => Promise<void> | void;
  children: React.ReactNode;
}

const DEADZONE_PX = 8;
const TRIGGER_PX = 56;
const HOLD_PX = 48;
const MAX_PULL_PX = 116;
const RESISTANCE_K = 125;
const RADIUS = 9.5;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const RETRACT_MS = 260;
const BRAND_GREEN = "#6CA824";
const RING_NEUTRAL = "#6D6559";

function getWindowScrollTop(): number {
  if (typeof window === "undefined") return 0;
  return Math.max(
    0,
    window.scrollY ||
      document.documentElement?.scrollTop ||
      document.body?.scrollTop ||
      0
  );
}

function shouldIgnoreTouchTarget(target: EventTarget | null): boolean {
  const element =
    target instanceof Element
      ? target
      : target instanceof Node
        ? target.parentElement
        : null;
  if (!element) return false;

  if (element.closest("input, textarea, select, nav, [data-no-ptr]")) {
    return true;
  }

  let current: HTMLElement | null =
    element instanceof HTMLElement ? element : element.parentElement;
  while (
    current &&
    current !== document.body &&
    current !== document.documentElement
  ) {
    if (current.scrollTop > 0) {
      return true;
    }
    current = current.parentElement;
  }

  return false;
}

function indicatorOffsetY(pullPx: number): number {
  return Math.max(-18, pullPx * 0.5 - 18);
}

export function PullToRefresh({ onRefresh, children }: PullToRefreshProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const liveRegionRef = useRef<HTMLDivElement>(null);
  const ringSvgRef = useRef<SVGSVGElement>(null);
  const spinnerSvgRef = useRef<SVGSVGElement>(null);
  const ringCircleRef = useRef<SVGCircleElement>(null);

  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  const refreshingRef = useRef(false);
  const retractTimerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const container = containerRef.current;
    if (!container) return;

    let tracking = false;
    let pulling = false;
    let startY = 0;
    let startX = 0;
    let currentPullPx = 0;
    let crossedThreshold = false;

    const clearRetractTimer = () => {
      if (retractTimerRef.current !== null) {
        window.clearTimeout(retractTimerRef.current);
        retractTimerRef.current = null;
      }
    };

    const setSpinnerMode = (active: boolean) => {
      if (ringSvgRef.current) {
        ringSvgRef.current.style.display = active ? "none" : "block";
      }
      if (spinnerSvgRef.current) {
        spinnerSvgRef.current.style.display = active ? "block" : "none";
      }
      if (liveRegionRef.current) {
        liveRegionRef.current.setAttribute(
          "aria-hidden",
          active ? "false" : "true"
        );
      }
    };

    const resetIdleStyles = () => {
      const contentEl = contentRef.current;
      const indicatorEl = indicatorRef.current;
      const ringEl = ringCircleRef.current;

      if (contentEl) {
        contentEl.style.transition = "";
        contentEl.style.transform = "";
        contentEl.style.willChange = "";
      }
      if (indicatorEl) {
        indicatorEl.style.transition = "";
        indicatorEl.style.transform = "translate3d(0, -18px, 0) scale(0.76)";
        indicatorEl.style.opacity = "0";
        indicatorEl.style.willChange = "";
      }
      if (ringEl) {
        ringEl.style.strokeDashoffset = `${CIRCUMFERENCE}`;
        ringEl.style.stroke = RING_NEUTRAL;
      }
      setSpinnerMode(false);
    };

    const applyVisualPull = (pullPx: number) => {
      const contentEl = contentRef.current;
      const indicatorEl = indicatorRef.current;
      const ringEl = ringCircleRef.current;

      const progress = Math.min(1, pullPx / TRIGGER_PX);
      const opacity =
        pullPx <= 0 ? 0 : Math.min(1, Math.max(0, (pullPx - 4) / 22));
      const scale = 0.76 + 0.24 * Math.min(1, Math.pow(progress, 0.85));
      const y = indicatorOffsetY(pullPx);

      if (contentEl) {
        contentEl.style.transform =
          pullPx > 0 ? `translate3d(0, ${pullPx.toFixed(2)}px, 0)` : "";
      }
      if (indicatorEl) {
        indicatorEl.style.transform = `translate3d(0, ${y.toFixed(2)}px, 0) scale(${scale.toFixed(3)})`;
        indicatorEl.style.opacity = `${opacity.toFixed(3)}`;
      }
      if (ringEl) {
        ringEl.style.strokeDashoffset = `${(CIRCUMFERENCE * (1 - progress)).toFixed(2)}`;
        ringEl.style.stroke = progress >= 1 ? BRAND_GREEN : RING_NEUTRAL;
      }

      if (progress >= 1 && !crossedThreshold) {
        crossedThreshold = true;
        if (
          typeof navigator !== "undefined" &&
          typeof navigator.vibrate === "function"
        ) {
          try {
            navigator.vibrate(8);
          } catch {
            // Ignore unsupported vibration calls
          }
        }
      } else if (progress < 0.92 && crossedThreshold) {
        crossedThreshold = false;
      }
    };

    const retractToIdle = () => {
      const contentEl = contentRef.current;
      const indicatorEl = indicatorRef.current;

      clearRetractTimer();
      currentPullPx = 0;
      crossedThreshold = false;

      if (contentEl) {
        contentEl.style.transition = `transform ${RETRACT_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`;
        contentEl.style.transform = "translate3d(0, 0, 0)";
      }
      if (indicatorEl) {
        indicatorEl.style.transition = `transform ${RETRACT_MS}ms cubic-bezier(0.22, 1, 0.36, 1), opacity 180ms ease`;
        indicatorEl.style.transform = "translate3d(0, -18px, 0) scale(0.76)";
        indicatorEl.style.opacity = "0";
      }

      retractTimerRef.current = window.setTimeout(() => {
        retractTimerRef.current = null;
        if (!mountedRef.current) return;
        refreshingRef.current = false;
        resetIdleStyles();
      }, RETRACT_MS + 10);
    };

    resetIdleStyles();

    const handleTouchStart = (event: TouchEvent) => {
      if (refreshingRef.current) return;
      if (event.touches.length !== 1) return;
      if (getWindowScrollTop() > 0) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      if (shouldIgnoreTouchTarget(event.target)) return;

      const touch = event.touches[0];
      tracking = true;
      pulling = false;
      startY = touch.clientY;
      startX = touch.clientX;
      currentPullPx = 0;
      crossedThreshold = false;
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (!tracking || refreshingRef.current) return;
      if (event.touches.length !== 1) {
        tracking = false;
        if (pulling) {
          pulling = false;
          retractToIdle();
        }
        return;
      }

      const touch = event.touches[0];
      const deltaY = touch.clientY - startY;
      const deltaX = touch.clientX - startX;

      if (!pulling) {
        if (getWindowScrollTop() > 0) {
          tracking = false;
          return;
        }
        if (deltaY < 0) {
          tracking = false;
          return;
        }
        if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 6) {
          tracking = false;
          return;
        }
        if (deltaY <= DEADZONE_PX || deltaY <= Math.abs(deltaX)) {
          return;
        }

        pulling = true;
        clearRetractTimer();
        setSpinnerMode(false);
        if (contentRef.current) {
          contentRef.current.style.transition = "none";
          contentRef.current.style.willChange = "transform";
        }
        if (indicatorRef.current) {
          indicatorElResetBeforePull(indicatorRef.current);
        }
      }

      if (deltaY <= DEADZONE_PX) {
        currentPullPx = 0;
        applyVisualPull(0);
        return;
      }

      if (event.cancelable) {
        event.preventDefault();
      }

      const raw = deltaY - DEADZONE_PX;
      const damped = (MAX_PULL_PX * raw) / (raw + RESISTANCE_K);
      currentPullPx = damped;
      applyVisualPull(damped);
    };

    const handleTouchEnd = async (event: TouchEvent) => {
      if (!tracking) return;
      const wasPulling = pulling;
      const releasedPull = currentPullPx;

      tracking = false;
      pulling = false;

      if (!wasPulling) {
        return;
      }

      if (releasedPull <= 0) {
        resetIdleStyles();
        return;
      }

      if (event.type === "touchcancel" || releasedPull < TRIGGER_PX) {
        retractToIdle();
        return;
      }

      refreshingRef.current = true;
      setSpinnerMode(true);

      const contentEl = contentRef.current;
      const indicatorEl = indicatorRef.current;
      if (contentEl) {
        contentEl.style.transition =
          "transform 240ms cubic-bezier(0.22, 1, 0.36, 1)";
        contentEl.style.transform = `translate3d(0, ${HOLD_PX}px, 0)`;
      }
      if (indicatorEl) {
        indicatorEl.style.transition =
          "transform 240ms cubic-bezier(0.22, 1, 0.36, 1), opacity 180ms ease";
        indicatorEl.style.transform = `translate3d(0, ${indicatorOffsetY(HOLD_PX).toFixed(2)}px, 0) scale(1)`;
        indicatorEl.style.opacity = "1";
      }

      try {
        await Promise.allSettled([
          Promise.resolve().then(() => onRefreshRef.current()),
          new Promise<void>((resolve) => window.setTimeout(resolve, 380)),
        ]);
      } finally {
        if (mountedRef.current) {
          retractToIdle();
        }
      }
    };

    container.addEventListener("touchstart", handleTouchStart, {
      passive: true,
    });
    container.addEventListener("touchmove", handleTouchMove, {
      passive: false,
    });
    container.addEventListener("touchend", handleTouchEnd, { passive: true });
    container.addEventListener("touchcancel", handleTouchEnd, {
      passive: true,
    });

    return () => {
      mountedRef.current = false;
      clearRetractTimer();
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchmove", handleTouchMove);
      container.removeEventListener("touchend", handleTouchEnd);
      container.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, []);

  return (
    <div ref={containerRef} className="relative flex-1 flex flex-col">
      <div
        ref={liveRegionRef}
        aria-live="polite"
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 z-10 flex h-32 justify-center overflow-hidden"
      >
        <div
          ref={indicatorRef}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-[#EAE3D5] bg-white/95 opacity-0 shadow-[0_2px_10px_rgba(44,42,39,0.08)]"
        >
          <svg
            ref={ringSvgRef}
            className="h-5 w-5 -rotate-90"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle
              cx="12"
              cy="12"
              r={RADIUS}
              stroke="#EAE3D5"
              strokeWidth="2.25"
            />
            <circle
              ref={ringCircleRef}
              cx="12"
              cy="12"
              r={RADIUS}
              stroke={RING_NEUTRAL}
              strokeWidth="2.25"
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={CIRCUMFERENCE}
            />
          </svg>
          <svg
            ref={spinnerSvgRef}
            className="hidden h-5 w-5 animate-spin text-[#6CA824]"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle
              cx="12"
              cy="12"
              r={RADIUS}
              stroke="#E8E1D3"
              strokeWidth="2.25"
            />
            <path
              d="M12 2.5a9.5 9.5 0 0 1 9.5 9.5"
              stroke="currentColor"
              strokeWidth="2.25"
              strokeLinecap="round"
            />
          </svg>
        </div>
      </div>

      <div ref={contentRef} className="flex-1 flex flex-col">
        {children}
      </div>
    </div>
  );
}

function indicatorElResetBeforePull(indicatorEl: HTMLDivElement): void {
  indicatorEl.style.transition = "none";
  indicatorEl.style.willChange = "transform, opacity";
}

export default PullToRefresh;
