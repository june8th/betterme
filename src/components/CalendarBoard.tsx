"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  WorkoutCategory,
  WorkoutCategoryMeta,
  WorkoutEntry,
  UserProfileData,
  getEntryCategoryIds,
  resolveCategoryMeta,
} from "@/lib/workout-types";
import {
  getTodayKey,
  buildDateKey,
  getDaysInMonth,
  isFutureDateKey,
  calculateStreaks,
  getMonthCompletedCount,
} from "@/lib/date-utils";
import DayDetailSheet from "@/components/DayDetailSheet";

export interface CalendarBoardProps {
  profile: UserProfileData;
  onToggleDay: (dateKey: string) => Promise<boolean> | boolean;
  onSaveDetail: (
    dateKey: string,
    detail: {
      completed: boolean;
      categories?: WorkoutCategory[];
      category?: WorkoutCategory;
      durationMinutes?: number;
      note?: string;
    }
  ) => Promise<void> | void;
  onOpenProfileTab?: () => void;
  onOpenSettingsTab?: () => void;
}

interface StampSnackbarState {
  kind: "stamped";
  dateKey: string;
  day: number;
}

interface LockedNoticeState {
  kind: "locked";
  message: string;
}

type ToastState = StampSnackbarState | LockedNoticeState | null;

function parseDateKeyParts(dateKey: string): {
  year: number;
  monthIndex0: number;
  month: number;
  day: number;
} {
  const [y, m, d] = dateKey.split("-").map((part) => parseInt(part, 10));
  const safeYear = Number.isFinite(y) ? y : 2026;
  const safeMonth = Number.isFinite(m) && m >= 1 && m <= 12 ? m : 1;
  const safeDay = Number.isFinite(d) && d >= 1 && d <= 31 ? d : 1;
  return {
    year: safeYear,
    monthIndex0: safeMonth - 1,
    month: safeMonth,
    day: safeDay,
  };
}

/**
 * Warm BetterMe-inspired sunlit home-fitness interior scene rotating across 6 motifs.
 * Uses pure layered SVG shapes with zero <defs> IDs so 31 simultaneous tiles never
 * experience SVG ID collisions on iOS Safari.
 */
function WorkoutTileScene({
  day,
  muted = false,
}: {
  day: number;
  muted?: boolean;
}): JSX.Element {
  const variant = (day - 1) % 6;

  return (
    <svg
      viewBox="0 0 100 100"
      className={`absolute inset-0 h-full w-full object-cover ${
        muted ? "saturate-[0.35] opacity-65" : ""
      }`}
      aria-hidden="true"
    >
      {/* Warm sunlit apartment wall & oak wood floor base */}
      {variant === 0 && (
        <>
          <rect width="100" height="68" fill="#E6D9C8" />
          <rect y="68" width="100" height="32" fill="#BA9D7F" />
          {/* Window & sunbeam */}
          <rect x="8" y="10" width="28" height="44" rx="3" fill="#F8F3EB" />
          <line x1="22" y1="10" x2="22" y2="54" stroke="#DFD2C0" strokeWidth="2" />
          <line x1="8" y1="32" x2="36" y2="32" stroke="#DFD2C0" strokeWidth="2" />
          <polygon points="36,12 86,68 34,68" fill="#FAF6EF" fillOpacity="0.42" />
          {/* Cozy linen sofa */}
          <rect x="54" y="46" width="38" height="22" rx="6" fill="#CBB8A3" />
          <rect x="58" y="40" width="30" height="12" rx="4" fill="#D8C8B6" />
          {/* Yoga mat */}
          <ellipse cx="46" cy="82" rx="28" ry="4.5" fill="#8C7B6A" fillOpacity="0.55" />
          {/* Lunge / overhead stretch silhouette */}
          <circle cx="46" cy="33" r="6" fill="#5A4334" />
          <path
            d="M42 41C44 39 48 39 50 41L53 57L39 57Z"
            fill="#C88267"
          />
          <path
            d="M41 42L33 25M51 42L59 25"
            stroke="#A8765B"
            strokeWidth="3.6"
            strokeLinecap="round"
          />
          <path
            d="M42 57L32 79M50 57L61 78"
            stroke="#46372D"
            strokeWidth="4.4"
            strokeLinecap="round"
          />
        </>
      )}

      {variant === 1 && (
        <>
          {/* Standing high-knee balance in sunlit room (matches Day 14 vibe) */}
          <rect width="100" height="70" fill="#E3D4C1" />
          <rect y="70" width="100" height="30" fill="#B39374" />
          {/* Arched sunlit doorway */}
          <path
            d="M14 70V28C14 17 23 10 33 10C43 10 52 17 52 28V70Z"
            fill="#F3ECE1"
          />
          <polygon points="20,24 88,70 40,70" fill="#FCF9F4" fillOpacity="0.4" />
          {/* Accent armchair on right */}
          <rect x="68" y="48" width="26" height="22" rx="5" fill="#CFC0AE" />
          <rect x="72" y="42" width="18" height="10" rx="3" fill="#DDD0C0" />
          {/* Standing knee-lift figure */}
          <circle cx="48" cy="27" r="5.6" fill="#4E392B" />
          <rect x="43" y="34" width="10" height="19" rx="4" fill="#F5EFE8" />
          <path
            d="M48 52L47 82"
            stroke="#8B634B"
            strokeWidth="4.2"
            strokeLinecap="round"
          />
          <path
            d="M49 52L61 58L56 71"
            stroke="#8B634B"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M43 38L37 49L47 50"
            stroke="#A5775C"
            strokeWidth="3.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}

      {variant === 2 && (
        <>
          {/* Cozy couch + floor core / leg stretch (matches Day 3 vibe) */}
          <rect width="100" height="64" fill="#DDD0C0" />
          <rect y="64" width="100" height="36" fill="#AD8E70" />
          {/* Sofa */}
          <rect x="8" y="34" width="58" height="28" rx="6" fill="#C7B6A2" />
          <rect x="12" y="27" width="24" height="14" rx="4" fill="#D5C6B4" />
          <rect x="38" y="27" width="24" height="14" rx="4" fill="#D5C6B4" />
          {/* Sunlit window right */}
          <rect x="74" y="8" width="20" height="46" rx="2" fill="#F7F2E9" />
          {/* Mat + seated stretch */}
          <rect x="16" y="79" width="68" height="5" rx="2.5" fill="#768465" />
          <circle cx="35" cy="54" r="5.5" fill="#4B382C" />
          <path
            d="M35 61L43 77L31 77Z"
            fill="#6E7D5C"
          />
          <path
            d="M41 76L69 76M40 75L58 60"
            stroke="#463830"
            strokeWidth="4.2"
            strokeLinecap="round"
          />
          <path
            d="M38 63L53 62"
            stroke="#A87A60"
            strokeWidth="3.3"
            strokeLinecap="round"
          />
        </>
      )}

      {variant === 3 && (
        <>
          {/* Bright room + mat plank / yoga flow (matches Day 4 / Day 9 vibe) */}
          <rect width="100" height="67" fill="#E8DDD0" />
          <rect y="67" width="100" height="33" fill="#BDA083" />
          {/* Framed wall art */}
          <rect x="16" y="14" width="22" height="28" rx="2" fill="#F6F1E8" stroke="#C7B59F" strokeWidth="2" />
          <circle cx="27" cy="28" r="5" fill="#D6B99B" />
          {/* Tall window */}
          <rect x="62" y="10" width="28" height="48" rx="3" fill="#FAF6EF" />
          {/* Potted plant */}
          <rect x="10" y="54" width="9" height="12" rx="2" fill="#9A7B5F" />
          <circle cx="12" cy="48" r="5" fill="#6F805D" />
          <circle cx="17" cy="45" r="4.5" fill="#5D6E4C" />
          {/* Mat & plank silhouette */}
          <rect x="16" y="81" width="68" height="4.5" rx="2.2" fill="#8C7662" />
          <circle cx="67" cy="58" r="5.2" fill="#513C2F" />
          <path
            d="M62 63L43 69"
            stroke="#C47D63"
            strokeWidth="7"
            strokeLinecap="round"
          />
          <path
            d="M43 69L24 79"
            stroke="#45372E"
            strokeWidth="4.5"
            strokeLinecap="round"
          />
          <path
            d="M62 65L64 80"
            stroke="#A4765C"
            strokeWidth="3.6"
            strokeLinecap="round"
          />
        </>
      )}

      {variant === 4 && (
        <>
          {/* Warm wood shelf + botanical plant + strength squat (matches Day 5 / Day 10 vibe) */}
          <rect width="100" height="68" fill="#DFD1BF" />
          <rect y="68" width="100" height="32" fill="#A68769" />
          {/* Wood console */}
          <rect x="8" y="46" width="32" height="22" rx="3" fill="#8A6C51" />
          {/* Indoor olive plant */}
          <rect x="76" y="52" width="11" height="15" rx="2.5" fill="#B99C80" />
          <circle cx="79" cy="42" r="6.5" fill="#647752" />
          <circle cx="85" cy="37" r="5.5" fill="#778A64" />
          <circle cx="75" cy="35" r="4.5" fill="#586A47" />
          {/* Sunlit patch */}
          <polygon points="32,10 72,10 88,68 24,68" fill="#FAF5EC" fillOpacity="0.36" />
          {/* Squat silhouette */}
          <circle cx="51" cy="31" r="5.8" fill="#4A362A" />
          <path
            d="M46 39C48 37 54 37 56 39L59 56L45 56Z"
            fill="#5C6C4D"
          />
          <path
            d="M47 56L38 66L40 81M56 56L64 66L62 81"
            stroke="#3E322A"
            strokeWidth="4.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M47 43L36 47M55 43L65 47"
            stroke="#A5785E"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
        </>
      )}

      {variant === 5 && (
        <>
          {/* Calm afternoon room + morning mobility reach (matches Day 1 / Day 12 vibe) */}
          <rect width="100" height="69" fill="#E5D7C6" />
          <rect y="69" width="100" height="31" fill="#B7987A" />
          {/* Soft curtain & window */}
          <rect x="64" y="8" width="26" height="54" rx="3" fill="#F8F3EA" />
          <rect x="58" y="8" width="8" height="58" rx="2" fill="#D5C5B2" />
          {/* Minimalist wall frame */}
          <rect x="12" y="18" width="24" height="28" rx="2" fill="#F2EBE0" stroke="#C5B29C" strokeWidth="1.8" />
          {/* Mobility side-reach silhouette */}
          <circle cx="48" cy="32" r="5.8" fill="#523C2F" />
          <path
            d="M42 40C45 38 51 38 54 40L56 59L40 59Z"
            fill="#8D604C"
          />
          <path
            d="M43 59L38 82M53 59L58 82"
            stroke="#42342C"
            strokeWidth="4.4"
            strokeLinecap="round"
          />
          <path
            d="M42 42C35 34 36 23 45 19M54 42L63 52"
            stroke="#A97B60"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
        </>
      )}
    </svg>
  );
}

export default function CalendarBoard({
  profile,
  onToggleDay,
  onSaveDetail,
  onOpenProfileTab,
  onOpenSettingsTab,
}: CalendarBoardProps): JSX.Element {
  const [todayKey, setTodayKey] = useState<string>(() => getTodayKey());

  useEffect(() => {
    const syncToday = () => {
      const latest = getTodayKey();
      setTodayKey((prev) => (prev === latest ? prev : latest));
    };
    window.addEventListener("focus", syncToday);
    document.addEventListener("visibilitychange", syncToday);
    return () => {
      window.removeEventListener("focus", syncToday);
      document.removeEventListener("visibilitychange", syncToday);
    };
  }, []);

  const todayParts = useMemo(() => parseDateKeyParts(todayKey), [todayKey]);

  const [viewYear, setViewYear] = useState<number>(() => todayParts.year);
  const [viewMonth0, setViewMonth0] = useState<number>(
    () => todayParts.monthIndex0
  );

  const [detailDateKey, setDetailDateKey] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearToastTimer = useCallback(() => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    clearToastTimer();
    setToast(null);
    setDetailDateKey(null);
  }, [profile.nickname, clearToastTimer]);

  useEffect(() => {
    return () => {
      clearToastTimer();
    };
  }, [clearToastTimer]);

  const showStampedSnackbar = useCallback(
    (dateKey: string, day: number) => {
      clearToastTimer();
      setToast({ kind: "stamped", dateKey, day });
      toastTimerRef.current = setTimeout(() => {
        setToast(null);
        toastTimerRef.current = null;
      }, 4500);
    },
    [clearToastTimer]
  );

  const showLockedNotice = useCallback(() => {
    clearToastTimer();
    setToast({
      kind: "locked",
      message: "내일 이후의 날짜는 아직 잠겨 있어요 🔒",
    });
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 2800);
  }, [clearToastTimer]);

  const resolveEntryMetas = useCallback(
    (entry?: WorkoutEntry | null): WorkoutCategoryMeta[] => {
      return getEntryCategoryIds(entry)
        .map((id) => resolveCategoryMeta(id, profile))
        .filter((meta): meta is WorkoutCategoryMeta => Boolean(meta));
    },
    [profile]
  );

  const daysInMonth = useMemo(
    () => getDaysInMonth(viewYear, viewMonth0),
    [viewYear, viewMonth0]
  );

  const monthCompleted = useMemo(
    () => getMonthCompletedCount(profile.workouts, viewYear, viewMonth0),
    [profile.workouts, viewYear, viewMonth0]
  );

  const { currentStreak, bestStreak, totalCompleted } = useMemo(
    () => calculateStreaks(profile.workouts, todayKey),
    [profile.workouts, todayKey]
  );

  const monthProgressPct =
    daysInMonth > 0
      ? Math.min(100, Math.round((monthCompleted / daysInMonth) * 100))
      : 0;

  const isViewingCurrentMonth =
    viewYear === todayParts.year && viewMonth0 === todayParts.monthIndex0;

  const todayEntry: WorkoutEntry | undefined = profile.workouts[todayKey];
  const isTodayCompleted = Boolean(todayEntry?.completed);

  const todayCategoryMetas = useMemo(
    () => resolveEntryMetas(todayEntry),
    [resolveEntryMetas, todayEntry]
  );

  const handlePrevMonth = () => {
    if (viewMonth0 === 0) {
      setViewYear((y) => y - 1);
      setViewMonth0(11);
    } else {
      setViewMonth0((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth0 === 11) {
      setViewYear((y) => y + 1);
      setViewMonth0(0);
    } else {
      setViewMonth0((m) => m + 1);
    }
  };

  const handleJumpToToday = () => {
    setViewYear(todayParts.year);
    setViewMonth0(todayParts.monthIndex0);
  };

  const handleStampDay = async (
    dateKey: string,
    day: number,
    snapToTodayMonth = false
  ) => {
    if (snapToTodayMonth && !isViewingCurrentMonth) {
      setViewYear(todayParts.year);
      setViewMonth0(todayParts.monthIndex0);
    }
    const nextState = await onToggleDay(dateKey);
    if (nextState !== false) {
      showStampedSnackbar(dateKey, day);
    }
  };

  const handleTilePress = async (
    dateKey: string,
    day: number,
    isFuture: boolean,
    isCompleted: boolean
  ) => {
    if (isFuture) {
      showLockedNotice();
      return;
    }

    if (isCompleted) {
      clearToastTimer();
      setToast(null);
      setDetailDateKey(dateKey);
      return;
    }

    await handleStampDay(dateKey, day, false);
  };

  const handleUndoStamp = async (dateKey: string) => {
    clearToastTimer();
    setToast(null);
    await onToggleDay(dateKey);
  };

  const handleOpenDetailFromSnackbar = (dateKey: string) => {
    clearToastTimer();
    setToast(null);
    setDetailDateKey(dateKey);
  };

  // Current month workout notes / category mini-feed (most recent up to 5 entries)
  const monthMemoEntries = useMemo(() => {
    const prefix = `${String(viewYear).padStart(4, "0")}-${String(
      viewMonth0 + 1
    ).padStart(2, "0")}-`;
    return Object.values(profile.workouts)
      .filter(
        (entry) =>
          entry.completed &&
          entry.date.startsWith(prefix) &&
          Boolean(
            getEntryCategoryIds(entry).length > 0 ||
              (entry.note && entry.note.trim().length > 0) ||
              entry.durationMinutes
          )
      )
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 5);
  }, [profile.workouts, viewYear, viewMonth0]);

  const activeSheetEntry = detailDateKey
    ? profile.workouts[detailDateKey]
    : undefined;

  return (
    <div className="space-y-4 px-4 pt-3 pb-8">
      {/* 1. Header & Streak Summary */}
      <section className="rounded-[24px] border border-[#ECE5D8] bg-white/85 p-4 shadow-[0_6px_24px_rgb(44,42,39,0.04)]">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="mb-0.5 text-[11px] font-semibold tracking-wide text-[#8C8479]">
              DAILY WORKOUT PLAN
            </p>
            {onOpenProfileTab ? (
              <button
                type="button"
                onClick={onOpenProfileTab}
                className="group inline-flex max-w-full items-center gap-1.5 rounded-full text-left transition active:opacity-75"
              >
                <span className="truncate text-[19px] font-extrabold tracking-tight text-[#2C2A27]">
                  {profile.nickname}님의 플랜
                </span>
                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#EFE9DD] text-xs font-bold text-[#6A6359] transition group-hover:bg-[#E4DCCB]">
                  ›
                </span>
              </button>
            ) : (
              <h1 className="truncate text-[19px] font-extrabold tracking-tight text-[#2C2A27]">
                {profile.nickname}님의 플랜
              </h1>
            )}
          </div>

          <div className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[#F2DCBA] bg-[#FFF4E2] px-3 py-1.5 text-xs font-extrabold text-[#9A5311] shadow-sm">
            <span>🔥</span>
            <span>{currentStreak}일 연속</span>
          </div>
        </div>

        {/* Monthly Goal / Progress Bar */}
        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="font-semibold text-[#4A453E]">
              이번 달 {monthCompleted}/{daysInMonth}일 달성
            </span>
            <span className="font-bold text-[#5B8E1D]">
              {monthProgressPct}% · 최고 {bestStreak}일 (총 {totalCompleted}회)
            </span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#EDE6DA]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#7BB72E] to-[#5B8E1D] transition-all duration-500 ease-out"
              style={{ width: `${monthProgressPct}%` }}
            />
          </div>
        </div>
      </section>

      {/* 2. Today's Quick Workout Card */}
      {!isTodayCompleted ? (
        <section className="relative overflow-hidden rounded-[26px] bg-gradient-to-br from-[#2F3B24] via-[#3A4A2C] to-[#26301D] p-5 text-white shadow-[0_12px_28px_rgba(38,48,29,0.2)]">
          <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-[#8BC83F]/15 blur-xl" />
          <div className="relative z-10">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="inline-flex items-center rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold text-[#EEF6E3]">
                오늘 · {todayParts.month}월 {todayParts.day}일 (Day{" "}
                {todayParts.day})
              </span>
              <span className="text-[11px] font-medium text-white/70">
                주 {profile.weeklyGoal}회 목표
              </span>
            </div>

            <p className="mb-3.5 text-[16px] font-bold leading-snug text-white">
              오늘의 운동을 마쳤다면 도장을 꾹 찍어보세요!
            </p>

            <button
              type="button"
              onClick={() =>
                handleStampDay(todayKey, todayParts.day, true)
              }
              className="w-full rounded-2xl bg-[#6FA827] py-3.5 px-4 text-[15px] font-extrabold text-white shadow-[0_6px_16px_rgba(111,168,39,0.35)] transition hover:bg-[#649922] active:scale-[0.98]"
            >
              오늘 운동 완료 도장 찍기 ✓
            </button>

            <div className="mt-2.5 text-center">
              <button
                type="button"
                onClick={() => setDetailDateKey(todayKey)}
                className="text-xs font-medium text-[#DCEAC8] underline underline-offset-4 transition hover:text-white"
              >
                운동 종류/메모와 함께 기록
              </button>
            </div>
          </div>
        </section>
      ) : (
        <section className="rounded-[26px] border border-[#C8E0A7] bg-gradient-to-br from-[#F1F8E6] via-[#E8F3D7] to-[#DFEDC9] p-5 shadow-[0_8px_24px_rgba(91,142,29,0.1)]">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="inline-flex items-center rounded-full bg-[#6FA827]/15 px-2.5 py-0.5 text-xs font-bold text-[#4B7A15]">
              오늘 · {todayParts.month}월 {todayParts.day}일 (Day{" "}
              {todayParts.day})
            </span>
            <button
              type="button"
              onClick={() => setDetailDateKey(todayKey)}
              className="rounded-full border border-[#C4DC9F] bg-white/90 px-3 py-1 text-xs font-bold text-[#4B7A15] shadow-sm transition active:scale-95"
            >
              메모·종류 수정
            </button>
          </div>

          <p className="text-[17px] font-extrabold text-[#293B14]">
            오늘 운동 완료! 멋져요 👏
          </p>

          {todayCategoryMetas.length > 0 ||
          todayEntry?.durationMinutes ||
          todayEntry?.note ? (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {todayCategoryMetas.map((meta) => (
                <span
                  key={meta.id}
                  className="inline-flex items-center gap-1 rounded-full bg-white/85 px-2.5 py-1 text-xs font-semibold text-[#3C4A2B]"
                >
                  <span>{meta.emoji}</span>
                  <span>{meta.label}</span>
                </span>
              ))}
              {todayEntry?.durationMinutes && (
                <span className="inline-flex items-center rounded-full bg-white/85 px-2.5 py-1 text-xs font-semibold text-[#3C4A2B]">
                  ⏱ {todayEntry.durationMinutes}분
                </span>
              )}
              {todayEntry?.note && (
                <p className="mt-1 w-full rounded-xl bg-white/75 px-3 py-2 text-xs font-medium text-[#3F3A34]">
                  “{todayEntry.note}”
                </p>
              )}
            </div>
          ) : (
            <p className="mt-1.5 text-xs font-medium text-[#526936]">
              오늘의 초록 체크 도장이 완료되었어요. 운동 종류나 메모도 추가해 보세요!
            </p>
          )}
        </section>
      )}

      {/* 3. Monthly BetterMe 5-Column Stamp Grid */}
      <section aria-label="월간 운동 스탬프 보드">
        {/* Month Switcher Bar */}
        <div className="mb-2.5 flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrevMonth}
              aria-label="이전 달"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-[#E6DFD2] bg-white text-sm font-bold text-[#3F3A34] shadow-sm transition active:scale-95"
            >
              &lt;
            </button>
            <h2 className="min-w-[96px] text-center text-[16px] font-extrabold tracking-tight text-[#2C2A27]">
              {viewYear}년 {viewMonth0 + 1}월
            </h2>
            <button
              type="button"
              onClick={handleNextMonth}
              aria-label="다음 달"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-[#E6DFD2] bg-white text-sm font-bold text-[#3F3A34] shadow-sm transition active:scale-95"
            >
              &gt;
            </button>
          </div>

          {!isViewingCurrentMonth ? (
            <button
              type="button"
              onClick={handleJumpToToday}
              className="rounded-full border border-[#C8E0A7] bg-[#EEF6E2] px-3 py-1 text-xs font-bold text-[#4E7E16] shadow-sm transition active:scale-95"
            >
              오늘로 이동
            </button>
          ) : (
            <span className="text-[11px] font-medium text-[#8C8479]">
              탭하여 도장 · 완료일 탭하여 메모
            </span>
          )}
        </div>

        {/* Cream-White 5-Column Stamp Card */}
        <div className="rounded-[28px] bg-white p-4 shadow-[0_8px_30px_rgb(44,42,39,0.05)] border border-[#ECE5D8]">
          <div className="grid grid-cols-5 gap-x-2.5 gap-y-3.5">
            {Array.from({ length: daysInMonth }, (_, idx) => {
              const day = idx + 1;
              const dateKey = buildDateKey(viewYear, viewMonth0, day);
              const entry = profile.workouts[dateKey];
              const isFuture = isFutureDateKey(dateKey, todayKey);
              const isToday = dateKey === todayKey;
              const isCompleted = !isFuture && Boolean(entry?.completed);
              const entryMetas = isCompleted ? resolveEntryMetas(entry) : [];
              const hasNote = Boolean(entry?.note && entry.note.trim().length > 0);

              return (
                <button
                  key={dateKey}
                  type="button"
                  onClick={() =>
                    handleTilePress(dateKey, day, isFuture, isCompleted)
                  }
                  aria-label={`${viewMonth0 + 1}월 ${day}일 Day ${day} ${
                    isFuture
                      ? "잠김"
                      : isCompleted
                      ? "운동 완료됨"
                      : "미완료"
                  }`}
                  className="group flex flex-col items-center gap-1.5 focus:outline-none"
                >
                  <div
                    className={`aspect-square w-full rounded-[18px] relative overflow-hidden flex items-center justify-center transition-transform duration-150 group-active:scale-95 ${
                      isFuture
                        ? "bg-[#F4F1EC] opacity-75"
                        : isToday && !isCompleted
                        ? "ring-2 ring-[#6FA827] ring-offset-2 ring-offset-white shadow-sm"
                        : isToday && isCompleted
                        ? "ring-2 ring-[#6FA827]/65 ring-offset-2 ring-offset-white"
                        : ""
                    }`}
                  >
                    {/* Warm room-light workout artwork */}
                    <WorkoutTileScene day={day} muted={isFuture} />

                    {/* State A: Completed (past or today) */}
                    {isCompleted && (
                      <>
                        <div className="absolute inset-0 bg-[#352A1F]/15" />
                        <span className="relative z-10 w-8 h-8 rounded-full bg-[#6FA827] ring-[2.5px] ring-white shadow-md flex items-center justify-center">
                          <svg
                            viewBox="0 0 20 20"
                            fill="none"
                            className="h-4 w-4 text-white"
                            aria-hidden="true"
                          >
                            <path
                              d="M5 10.5L8.4 13.8L15 6.6"
                              stroke="currentColor"
                              strokeWidth="2.7"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </span>

                        {(entryMetas.length > 0 || hasNote) && (
                          <span className="absolute bottom-1 right-1 z-10 inline-flex max-w-[calc(100%-0.5rem)] items-center gap-0.5 rounded-md bg-white/90 px-1 py-0.5 text-[9px] leading-none shadow-sm">
                            {entryMetas.slice(0, 2).map((meta) => (
                              <span key={meta.id}>{meta.emoji}</span>
                            ))}
                            {entryMetas.length > 2 && (
                              <span className="text-[8px] font-bold text-[#4B7A15]">
                                +{entryMetas.length - 2}
                              </span>
                            )}
                            {hasNote && (
                              <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[#5B8E1D]" />
                            )}
                          </span>
                        )}
                      </>
                    )}

                    {/* State B: Today Uncompleted micro-indicator */}
                    {!isFuture && !isCompleted && isToday && (
                      <span className="absolute top-1 left-1/2 -translate-x-1/2 z-10 rounded-full bg-[#6FA827] px-1.5 py-[1px] text-[8px] font-extrabold tracking-wider text-white shadow-sm">
                        TODAY
                      </span>
                    )}

                    {/* State C: Future Date Lock */}
                    {isFuture && (
                      <>
                        <div className="absolute inset-0 bg-[#F4F1EC]/72" />
                        <span className="relative z-10 flex items-center justify-center">
                          <svg
                            viewBox="0 0 28 28"
                            fill="none"
                            className="h-6 w-6 drop-shadow-sm"
                            aria-hidden="true"
                          >
                            <path
                              d="M9.5 12V9.5C9.5 7.01472 11.5147 5 14 5C16.4853 5 18.5 7.01472 18.5 9.5V12"
                              stroke="#5E5850"
                              strokeWidth="2.4"
                              strokeLinecap="round"
                            />
                            <rect
                              x="6.5"
                              y="11.5"
                              width="15"
                              height="12"
                              rx="4"
                              fill="#5E5850"
                            />
                            <circle cx="14" cy="16.8" r="1.25" fill="#FAF7F2" />
                            <path
                              d="M14 17.8V19.8"
                              stroke="#FAF7F2"
                              strokeWidth="1.6"
                              strokeLinecap="round"
                            />
                          </svg>
                        </span>
                      </>
                    )}
                  </div>

                  {/* Day {d} Label */}
                  <span
                    className={`text-[11px] font-semibold leading-tight ${
                      isToday
                        ? "font-bold text-[#5B8E1D]"
                        : isFuture
                        ? "text-[#A39C92]"
                        : "text-[#4A453E]"
                    }`}
                  >
                    Day {day}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* 4. Compact Monthly Workout Notes Mini-Feed */}
      {monthMemoEntries.length > 0 && (
        <section className="rounded-[24px] border border-[#ECE5D8] bg-white p-4 shadow-[0_6px_24px_rgb(44,42,39,0.04)]">
          <div className="mb-2.5 flex items-center justify-between">
            <h3 className="text-sm font-extrabold text-[#2C2A27]">
              이번 달 운동 메모
            </h3>
            <span className="text-[11px] font-medium text-[#8C8479]">
              최근 {monthMemoEntries.length}개 · 탭하여 수정
            </span>
          </div>

          <div className="divide-y divide-[#F1ECE2]">
            {monthMemoEntries.map((item) => {
              const parts = parseDateKeyParts(item.date);
              const cats = resolveEntryMetas(item);

              return (
                <button
                  key={item.date}
                  type="button"
                  onClick={() => setDetailDateKey(item.date)}
                  className="flex w-full items-center justify-between gap-3 py-2.5 text-left transition active:opacity-70"
                >
                  <div className="min-w-0 flex-1">
                    <div className="mb-0.5 flex flex-wrap items-center gap-1.5">
                      <span className="rounded-md bg-[#EEF6E2] px-1.5 py-0.5 text-[11px] font-bold text-[#4E7E16]">
                        Day {parts.day}
                      </span>
                      <span className="text-xs font-semibold text-[#5C554B]">
                        {parts.month}월 {parts.day}일
                      </span>
                      {cats.length > 0 && (
                        <span className="text-xs font-medium text-[#3F3A34]">
                          · {cats.map((c) => `${c.emoji} ${c.label}`).join(", ")}
                        </span>
                      )}
                      {item.durationMinutes && (
                        <span className="text-[11px] text-[#7D756A]">
                          ({item.durationMinutes}분)
                        </span>
                      )}
                    </div>
                    {item.note ? (
                      <p className="truncate text-xs text-[#4A453E]">
                        {item.note}
                      </p>
                    ) : (
                      <p className="truncate text-xs text-[#9C9488]">
                        메모 추가하기
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-xs font-semibold text-[#8C8479]">
                    수정 ›
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Floating Snackbar (1-Tap Stamp Undo / Add Detail OR Locked Future Notice) */}
      {toast && (
        <div className="pointer-events-none fixed left-1/2 bottom-[calc(5.25rem+env(safe-area-inset-bottom,0px))] z-40 w-[calc(100%-2rem)] max-w-[398px] -translate-x-1/2">
          {toast.kind === "stamped" ? (
            <div className="pointer-events-auto flex items-center justify-between gap-2 rounded-2xl bg-[#27311E] px-3.5 py-3 text-white shadow-[0_10px_28px_rgba(30,38,22,0.32)]">
              <span className="truncate text-xs font-bold">
                Day {toast.day} 운동 완료! ✓
              </span>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleOpenDetailFromSnackbar(toast.dateKey)}
                  className="rounded-xl bg-[#6FA827] px-2.5 py-1.5 text-[11px] font-bold text-white transition active:scale-95"
                >
                  운동 종류·메모 추가
                </button>
                <button
                  type="button"
                  onClick={() => handleUndoStamp(toast.dateKey)}
                  className="rounded-xl bg-white/15 px-2.5 py-1.5 text-[11px] font-semibold text-white/90 transition hover:bg-white/25 active:scale-95"
                >
                  취소
                </button>
              </div>
            </div>
          ) : (
            <div className="pointer-events-auto mx-auto w-fit rounded-full bg-[#3A352F]/95 px-4 py-2.5 text-center text-xs font-semibold text-[#FAF7F2] shadow-lg">
              {toast.message}
            </div>
          )}
        </div>
      )}

      {/* Day Detail Bottom Sheet */}
      <DayDetailSheet
        isOpen={detailDateKey !== null}
        dateKey={detailDateKey}
        entry={activeSheetEntry}
        categories={profile.categories}
        archivedCategories={profile.archivedCategories}
        isToday={detailDateKey === todayKey}
        onClose={() => setDetailDateKey(null)}
        onSave={onSaveDetail}
        onOpenSettingsTab={onOpenSettingsTab}
      />
    </div>
  );
}
