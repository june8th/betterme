"use client";

import React, { useEffect, useMemo, useState } from "react";
import { getTodayKey } from "@/lib/date-utils";
import type { LeaderboardEntry, LeaderboardSortBy } from "@/lib/workout-types";

export interface LeaderboardViewProps {
  currentNickname: string;
  entries: LeaderboardEntry[];
  syncing: boolean;
  onRefresh: () => Promise<void> | void;
}

const SORT_OPTIONS: ReadonlyArray<{
  id: LeaderboardSortBy;
  label: string;
}> = [
  { id: "month", label: "이번 달" },
  { id: "streak", label: "현재 연속 🔥" },
  { id: "total", label: "전체 누적" },
];

function getCurrentMonthLabel(): string {
  const todayKey = getTodayKey();
  const [y, m] = todayKey.split("-").map((part) => parseInt(part, 10));
  if (Number.isFinite(y) && Number.isFinite(m)) {
    return `${y}년 ${m}월 기준`;
  }
  const now = new Date();
  return `${now.getFullYear()}년 ${now.getMonth() + 1}월 기준`;
}

function sortLeaderboardEntries(
  entries: LeaderboardEntry[],
  sortBy: LeaderboardSortBy
): LeaderboardEntry[] {
  return [...entries].sort((a, b) => {
    if (sortBy === "month") {
      if (b.monthCompleted !== a.monthCompleted) {
        return b.monthCompleted - a.monthCompleted;
      }
      if (b.currentStreak !== a.currentStreak) {
        return b.currentStreak - a.currentStreak;
      }
      if (b.totalCompleted !== a.totalCompleted) {
        return b.totalCompleted - a.totalCompleted;
      }
      if (b.totalMinutes !== a.totalMinutes) {
        return b.totalMinutes - a.totalMinutes;
      }
      return a.nickname.localeCompare(b.nickname);
    }

    if (sortBy === "streak") {
      if (b.currentStreak !== a.currentStreak) {
        return b.currentStreak - a.currentStreak;
      }
      if (b.bestStreak !== a.bestStreak) {
        return b.bestStreak - a.bestStreak;
      }
      if (b.monthCompleted !== a.monthCompleted) {
        return b.monthCompleted - a.monthCompleted;
      }
      if (b.totalCompleted !== a.totalCompleted) {
        return b.totalCompleted - a.totalCompleted;
      }
      return a.nickname.localeCompare(b.nickname);
    }

    if (b.totalCompleted !== a.totalCompleted) {
      return b.totalCompleted - a.totalCompleted;
    }
    if (b.currentStreak !== a.currentStreak) {
      return b.currentStreak - a.currentStreak;
    }
    if (b.bestStreak !== a.bestStreak) {
      return b.bestStreak - a.bestStreak;
    }
    if (b.totalMinutes !== a.totalMinutes) {
      return b.totalMinutes - a.totalMinutes;
    }
    return a.nickname.localeCompare(b.nickname);
  });
}

function getPrimaryMetricValue(
  entry: LeaderboardEntry,
  sortBy: LeaderboardSortBy
): number {
  if (sortBy === "month") {
    return entry.monthCompleted;
  }
  if (sortBy === "streak") {
    return entry.currentStreak;
  }
  return entry.totalCompleted;
}

function formatPrimaryScore(
  entry: LeaderboardEntry,
  sortBy: LeaderboardSortBy
): string {
  if (sortBy === "month") {
    return `${entry.monthCompleted}일`;
  }
  if (sortBy === "streak") {
    return `${entry.currentStreak}일 🔥`;
  }
  return `${entry.totalCompleted}회`;
}

function getRankBadgeStyle(rank: number): {
  label: string;
  className: string;
} {
  if (rank === 1) {
    return {
      label: "🥇",
      className: "bg-[#FFF4D6] border border-[#F2D58A] text-base",
    };
  }
  if (rank === 2) {
    return {
      label: "🥈",
      className: "bg-[#F3F4F6] border border-[#D9DCE2] text-base",
    };
  }
  if (rank === 3) {
    return {
      label: "🥉",
      className: "bg-[#FBEDE3] border border-[#E7C2A8] text-base",
    };
  }
  return {
    label: String(rank),
    className:
      "bg-[#FAF7F2] border border-[#E8E0D2] text-xs font-extrabold text-[#6E675C]",
  };
}

export default function LeaderboardView({
  currentNickname,
  entries,
  syncing,
  onRefresh,
}: LeaderboardViewProps): JSX.Element {
  const [sortBy, setSortBy] = useState<LeaderboardSortBy>("month");
  const [refreshing, setRefreshing] = useState(false);
  const [monthSubtitle, setMonthSubtitle] = useState<string>(() =>
    getCurrentMonthLabel()
  );

  useEffect(() => {
    void onRefresh();
  }, [onRefresh]);

  useEffect(() => {
    const syncMonthLabel = () => {
      if (document.visibilityState && document.visibilityState !== "visible") {
        return;
      }
      const nextLabel = getCurrentMonthLabel();
      setMonthSubtitle((prev) => (prev === nextLabel ? prev : nextLabel));
    };
    window.addEventListener("focus", syncMonthLabel);
    document.addEventListener("visibilitychange", syncMonthLabel);
    return () => {
      window.removeEventListener("focus", syncMonthLabel);
      document.removeEventListener("visibilitychange", syncMonthLabel);
    };
  }, []);

  const sortedEntries = useMemo(
    () => sortLeaderboardEntries(entries, sortBy),
    [entries, sortBy]
  );

  const displayRanks = useMemo(() => {
    const ranks: number[] = [];
    for (let idx = 0; idx < sortedEntries.length; idx += 1) {
      if (
        idx > 0 &&
        getPrimaryMetricValue(sortedEntries[idx], sortBy) ===
          getPrimaryMetricValue(sortedEntries[idx - 1], sortBy)
      ) {
        ranks.push(ranks[idx - 1]);
      } else {
        ranks.push(idx + 1);
      }
    }
    return ranks;
  }, [sortedEntries, sortBy]);

  const normalizedMe = currentNickname.trim().toLowerCase();
  const myIndex = sortedEntries.findIndex(
    (item) => item.nickname.trim().toLowerCase() === normalizedMe
  );
  const myEntry = myIndex >= 0 ? sortedEntries[myIndex] : null;
  const myRank = myIndex >= 0 ? displayRanks[myIndex] : null;
  const isMyRankTied =
    myRank !== null &&
    displayRanks.filter((rankVal) => rankVal === myRank).length > 1;

  const handleManualRefresh = async () => {
    if (refreshing || syncing) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  const isBusy = refreshing || syncing;

  return (
    <div className="space-y-4 px-4 pt-3 pb-8">
      {/* 1. Header Card + My Rank + Sort Filter */}
      <section className="rounded-[28px] bg-white p-5 border border-[#ECE5D8] shadow-[0_8px_30px_rgb(44,42,39,0.05)] space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[18px] font-extrabold tracking-tight text-[#2C2A27]">
              함께하는 운동 리더보드 🏆
            </h1>
            <p className="text-xs text-[#7D766B] mt-0.5">{monthSubtitle}</p>
          </div>

          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={isBusy}
            aria-label="리더보드 새로고침"
            className="inline-flex items-center gap-1.5 rounded-full border border-[#E5DEC9] bg-[#FAF7F2] hover:bg-[#F1ECE2] disabled:opacity-60 px-3 py-1.5 text-xs font-semibold text-[#4A453D] transition active:scale-95 shrink-0"
          >
            <svg
              className={`w-3.5 h-3.5 text-[#6CA824] ${
                isBusy ? "animate-spin" : ""
              }`}
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M20 11A8.1 8.1 0 0 0 4.5 9M4 5v4h4M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4"
                stroke="currentColor"
                strokeWidth="2.1"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>{isBusy ? "동기화 중" : "새로고침"}</span>
          </button>
        </div>

        {/* My Rank Summary Strip */}
        {myEntry && myRank !== null && (
          <div className="flex items-center justify-between gap-2 rounded-2xl border border-[#CBE2AC] bg-[#F4FAEB] px-3.5 py-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <span className="rounded-full bg-[#6CA824] px-2 py-0.5 text-[10px] font-bold text-white shrink-0">
                내 순위
              </span>
              <span className="text-xs font-bold text-[#2C2A27] truncate">
                {isMyRankTied ? `공동 ${myRank}위` : `현재 ${myRank}위`}{" "}
                <span className="font-medium text-[#6C665C]">
                  / 총 {sortedEntries.length}명
                </span>
              </span>
            </div>
            <span className="text-xs font-extrabold text-[#4E7E16] shrink-0">
              {formatPrimaryScore(myEntry, sortBy)}
            </span>
          </div>
        )}

        {/* 3-Way Segmented Sort Filter */}
        <div
          role="tablist"
          aria-label="리더보드 정렬 기준"
          className="grid grid-cols-3 gap-1 rounded-2xl bg-[#F4EFE6] p-1"
        >
          {SORT_OPTIONS.map((option) => {
            const active = sortBy === option.id;
            return (
              <button
                key={option.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSortBy(option.id)}
                className={`rounded-xl py-2 px-2 text-xs font-bold transition ${
                  active
                    ? "bg-white text-[#2C2A27] shadow-sm"
                    : "text-[#7A7267] hover:text-[#4A453D]"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* 2. Ranked Leaderboard Cards */}
      <section aria-label="순위 목록" className="space-y-2.5">
        {sortedEntries.length === 0 ? (
          <div className="rounded-[24px] border border-[#ECE5D8] bg-white p-6 text-center shadow-[0_6px_22px_rgb(44,42,39,0.04)]">
            <p className="text-sm font-bold text-[#2C2A27]">
              아직 집계된 운동 기록이 없어요
            </p>
            <p className="mt-1 text-xs text-[#7D766B]">
              운동 달력에서 오늘의 완료 도장을 찍으면 바로 순위에 반영됩니다!
            </p>
          </div>
        ) : (
          sortedEntries.map((entry, idx) => {
            const rank = displayRanks[idx] ?? idx + 1;
            const isMe =
              entry.nickname.trim().toLowerCase() === normalizedMe;
            const rankBadge = getRankBadgeStyle(rank);

            return (
              <div
                key={entry.nickname.toLowerCase()}
                className={`flex items-center justify-between gap-3 rounded-[24px] border p-4 shadow-[0_6px_22px_rgb(44,42,39,0.04)] transition ${
                  isMe
                    ? "border-[#6CA824]/45 bg-[#F4FAEB]"
                    : "border-[#ECE5D8] bg-white"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {/* Rank Badge */}
                  <div
                    className={`w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 ${rankBadge.className}`}
                    aria-label={`${rank}위`}
                  >
                    {rankBadge.label}
                  </div>

                  {/* User Info & Stats */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-extrabold text-[#2C2A27] truncate">
                        {entry.nickname}
                      </span>
                      {isMe && (
                        <span className="rounded-full bg-[#6CA824] px-2 py-0.5 text-[10px] font-bold text-white shrink-0">
                          나
                        </span>
                      )}
                      {entry.todayCompleted && (
                        <span className="inline-flex items-center rounded-full border border-[#CBE2AC] bg-[#EAF4DC] px-2 py-0.5 text-[10px] font-bold text-[#4E7E16] shrink-0">
                          오늘 완료 ✓
                        </span>
                      )}
                    </div>

                    <p className="mt-1 text-[11px] font-medium text-[#70695E] truncate">
                      이번 달 {entry.monthCompleted}일 · 🔥 {entry.currentStreak}
                      일 연속 · 누적 {entry.totalCompleted}회
                      {entry.totalMinutes > 0
                        ? ` · ${entry.totalMinutes}분`
                        : ""}
                    </p>
                  </div>
                </div>

                {/* Primary Metric Score Badge */}
                <div
                  className={`rounded-2xl px-3 py-1.5 text-xs font-extrabold shrink-0 ${
                    isMe
                      ? "bg-[#6CA824] text-white shadow-sm"
                      : "bg-[#FAF7F2] border border-[#E6DFD2] text-[#2C2A27]"
                  }`}
                >
                  {formatPrimaryScore(entry, sortBy)}
                </div>
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}
