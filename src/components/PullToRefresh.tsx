"use client";

import React, { useEffect, useRef, useState } from "react";

export interface PullToRefreshProps {
  onRefresh: () => Promise<void> | void;
  children: React.ReactNode;
}

const DEADZONE_PX = 10;
const TRIGGER_PX = 64;
const MAX_PULL_PX = 108;

function getWindowScrollTop(): number {
  if (typeof window === "undefined") {
    return 0;
  }
  return Math.max(
    0,
    window.scrollY ||
      document.documentElement?.scrollTop ||
      document.body?.scrollTop ||
      0
  );
}

function shouldIgnoreTouchTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }

  if (target.closest("input, textarea, select, [data-no-ptr]")) {
    return true;
  }

  let current: Element | null = target;
  while (current && current !== document.documentElement) {
    if (current instanceof HTMLElement && current.scrollTop > 0) {
      return true;
    }
    current = current.parentElement;
  }

  return false;
}

export default function PullToRefresh({
  onRefresh,
  children,
}: PullToRefreshProps): JSX.Element {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const onRefreshRef = useRef(onRefresh);
  const pullDistanceRef = useRef(0);
  const refreshingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let startX = 0;
    let startY = 0;
    let armed = false;
    let pulling = false;

    const updatePullDistance = (next: number) => {
      pullDistanceRef.current = next;
      setPullDistance(next);
    };

    const handleTouchStart = (event: TouchEvent) => {
      if (refreshingRef.current) return;
      if (event.touches.length !== 1) {
        armed = false;
        return;
      }
      if (getWindowScrollTop() > 0) {
        armed = false;
        return;
      }
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) {
        armed = false;
        return;
      }
      if (shouldIgnoreTouchTarget(event.target)) {
        armed = false;
        return;
      }

      const touch = event.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      armed = true;
      pulling = false;
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (!armed || refreshingRef.current) return;
      if (event.touches.length !== 1) {
        armed = false;
        pulling = false;
        setIsDragging(false);
        updatePullDistance(0);
        return;
      }

      const touch = event.touches[0];
      const deltaY = touch.clientY - startY;
      const deltaX = Math.abs(touch.clientX - startX);

      if (!pulling) {
        if (deltaY <= 0 || getWindowScrollTop() > 0) {
          armed = false;
          return;
        }
        if (deltaX > deltaY && deltaX > 8) {
          armed = false;
          return;
        }
        if (deltaY < DEADZONE_PX) {
          return;
        }
        pulling = true;
        setIsDragging(true);
      }

      if (getWindowScrollTop() > 0) {
        pulling = false;
        armed = false;
        setIsDragging(false);
        updatePullDistance(0);
        return;
      }

      if (event.cancelable) {
        event.preventDefault();
      }

      const damped = Math.min(
        MAX_PULL_PX,
        Math.max(0, (deltaY - DEADZONE_PX) * 0.48)
      );
      updatePullDistance(damped);
    };

    const handleTouchEnd = async (event: TouchEvent) => {
      setIsDragging(false);
      if (!pulling) {
        armed = false;
        return;
      }

      armed = false;
      pulling = false;

      if (
        event.type === "touchend" &&
        pullDistanceRef.current >= TRIGGER_PX &&
        !refreshingRef.current
      ) {
        refreshingRef.current = true;
        setRefreshing(true);
        updatePullDistance(56);
        try {
          await Promise.all([
            Promise.resolve(onRefreshRef.current()),
            new Promise<void>((resolve) => setTimeout(resolve, 250)),
          ]);
        } finally {
          if (mountedRef.current) {
            refreshingRef.current = false;
            setRefreshing(false);
            updatePullDistance(0);
          }
        }
      } else {
        updatePullDistance(0);
      }
    };

    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });
    window.addEventListener("touchcancel", handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, []);

  const isReady = pullDistance >= TRIGGER_PX;
  const showIndicator = pullDistance > 0 || refreshing;
  const arrowRotationDeg = isReady
    ? 180
    : Math.round(Math.min(1, pullDistance / TRIGGER_PX) * 165);
  const pillTranslateY = refreshing
    ? 8
    : Math.min(20, Math.round(pullDistance - 44));
  const pillOpacity = refreshing ? 1 : Math.min(1, pullDistance / 36);

  return (
    <>
      {showIndicator && (
        <div
          aria-live="polite"
          className={`fixed left-1/2 z-50 pointer-events-none ${
            isDragging
              ? ""
              : "transition-[transform,opacity] duration-200 ease-out"
          }`}
          style={{
            top: "calc(env(safe-area-inset-top, 0px) + 0.5rem)",
            transform: `translate(-50%, ${pillTranslateY}px)`,
            opacity: pillOpacity,
          }}
        >
          <div
            className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-bold shadow-[0_8px_24px_rgba(44,42,39,0.12)] backdrop-blur-md transition-colors ${
              refreshing || isReady
                ? "border-[#CBE2AC] bg-[#F4FAEB]/95 text-[#4B7A15]"
                : "border-[#E6DFD2] bg-white/95 text-[#4A453E]"
            }`}
          >
            {refreshing ? (
              <svg
                className="w-3.5 h-3.5 text-[#6CA824] animate-spin shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M20 11A8.1 8.1 0 0 0 4.5 9M4 5v4h4M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : (
              <svg
                className="w-3.5 h-3.5 text-[#6CA824] transition-transform duration-150 shrink-0"
                style={{ transform: `rotate(${arrowRotationDeg}deg)` }}
                viewBox="0 0 20 20"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M10 4v11m0 0l-4-4m4 4l4-4"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
            <span>
              {refreshing
                ? "새로고침 중..."
                : isReady
                ? "놓아서 새로고침"
                : "아래로 당겨 새로고침"}
            </span>
          </div>
        </div>
      )}

      <div
        aria-hidden="true"
        className={
          isDragging
            ? "w-full shrink-0 overflow-hidden"
            : "w-full shrink-0 overflow-hidden transition-[height] duration-200 ease-out"
        }
        style={{
          height: refreshing
            ? 44
            : pullDistance > 0
            ? Math.round(pullDistance * 0.55)
            : 0,
        }}
      />

      {children}
    </>
  );
}
