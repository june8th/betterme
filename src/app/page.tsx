"use client";

import React, { useState } from "react";
import { useWorkoutStore } from "@/lib/workout-store";
import CalendarBoard from "@/components/CalendarBoard";
import LeaderboardView from "@/components/LeaderboardView";
import OnboardingView from "@/components/OnboardingView";
import ProfileView from "@/components/ProfileView";
import PullToRefresh from "@/components/PullToRefresh";
import SettingsView from "@/components/SettingsView";

type AppTab = "calendar" | "leaderboard" | "profile" | "settings";

export default function HomePage() {
  const {
    hydrated,
    syncing,
    activeNickname,
    profile,
    savedNicknames,
    leaderboard,
    refreshLeaderboard,
    syncNow,
    loginWithNickname,
    logoutNickname,
    renameActiveNickname,
    deleteSavedNickname,
    setWeeklyGoal,
    addWorkoutCategory,
    removeWorkoutCategory,
    moveWorkoutCategory,
    resetWorkoutCategories,
    toggleWorkoutDay,
    saveWorkoutDetail,
    exportBackupJson,
    importBackupJson,
  } = useWorkoutStore();

  const [activeTab, setActiveTab] = useState<AppTab>("calendar");

  const handlePullRefresh = async () => {
    await Promise.race([
      syncNow(),
      new Promise<void>((resolve) => setTimeout(resolve, 2500)),
    ]);
    window.location.reload();
  };

  // Clean warm skeleton while hydrating localStorage (prevents flicker on iPhone Safari)
  if (!hydrated) {
    return (
      <div className="min-h-dvh bg-[#FAF7F2] px-4 pt-safe pb-safe flex flex-col gap-4">
        <div className="h-12 rounded-2xl bg-[#EFE9DD]/80 animate-pulse mt-2" />
        <div className="h-28 rounded-[24px] bg-[#EFE9DD]/70 animate-pulse" />
        <div className="h-36 rounded-[26px] bg-[#EFE9DD]/70 animate-pulse" />
        <div className="flex-1 rounded-[28px] bg-white/70 border border-[#ECE5D8] p-4">
          <div className="grid grid-cols-5 gap-2.5">
            {Array.from({ length: 15 }, (_, idx) => (
              <div
                key={idx}
                className="aspect-square rounded-[18px] bg-[#EFE9DD]/75 animate-pulse"
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Welcome / Nickname Onboarding when no active user is selected
  if (!activeNickname || !profile) {
    return (
      <PullToRefresh onRefresh={handlePullRefresh}>
        <OnboardingView
          savedNicknames={savedNicknames}
          onStart={async (nickname) => {
            await loginWithNickname(nickname);
            setActiveTab("calendar");
          }}
        />
      </PullToRefresh>
    );
  }

  const userInitial = profile.nickname.trim().slice(0, 1).toUpperCase() || "B";

  return (
    <PullToRefresh onRefresh={handlePullRefresh}>
      <div className="min-h-dvh bg-[#FAF7F2] text-[#2C2A27] flex flex-col">
      {/* Top Safe-Area Sticky Bar */}
      <header className="sticky top-0 z-30 bg-[#FAF7F2]/90 backdrop-blur-md border-b border-[#EAE3D5]/85 pt-safe px-4 pb-2.5">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setActiveTab("calendar")}
            className="inline-flex items-center gap-2 text-left focus:outline-none active:opacity-80 transition"
          >
            <span className="w-7 h-7 rounded-full bg-[#6CA824] text-white flex items-center justify-center shadow-[0_3px_10px_rgba(108,168,36,0.28)] ring-2 ring-white">
              <svg
                className="w-4 h-4"
                viewBox="0 0 20 20"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M5 10.5L8.4 13.8L15 6.6"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span className="text-[18px] font-extrabold tracking-tight text-[#2C2A27]">
              better<span className="text-[#6CA824]">me</span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("profile")}
            aria-label={`${profile.nickname} 프로필 열기`}
            className={`inline-flex items-center gap-1.5 rounded-full pl-1.5 pr-3 py-1 text-xs font-bold border transition active:scale-95 max-w-[190px] ${
              activeTab === "profile"
                ? "bg-[#6CA824]/12 border-[#6CA824]/35 text-[#4B7A15]"
                : "bg-white border-[#EAE3D5] text-[#3F3A34] shadow-sm"
            }`}
          >
            <span className="w-5 h-5 rounded-full bg-[#6CA824] text-white text-[11px] font-bold flex items-center justify-center shrink-0">
              {userInitial}
            </span>
            <span className="truncate">{profile.nickname}</span>
            {syncing && (
              <span
                className="w-1.5 h-1.5 rounded-full bg-[#6CA824] animate-pulse shrink-0"
                title="동기화 중"
              />
            )}
          </button>
        </div>
      </header>

      {/* Main Scrollable Content Area */}
      <main className="flex-1 pb-24">
        {activeTab === "calendar" ? (
          <CalendarBoard
            profile={profile}
            onToggleDay={toggleWorkoutDay}
            onSaveDetail={saveWorkoutDetail}
            onOpenProfileTab={() => setActiveTab("profile")}
            onOpenSettingsTab={() => setActiveTab("settings")}
          />
        ) : activeTab === "leaderboard" ? (
          <LeaderboardView
            currentNickname={profile.nickname}
            entries={leaderboard}
            syncing={syncing}
            onRefresh={refreshLeaderboard}
          />
        ) : activeTab === "profile" ? (
          <ProfileView
            profile={profile}
            savedNicknames={savedNicknames}
            syncing={syncing}
            onSwitchNickname={loginWithNickname}
            onRenameNickname={renameActiveNickname}
            onDeleteNickname={deleteSavedNickname}
            onLogout={logoutNickname}
          />
        ) : (
          <SettingsView
            profile={profile}
            syncing={syncing}
            onAddCategory={addWorkoutCategory}
            onRemoveCategory={removeWorkoutCategory}
            onMoveCategory={moveWorkoutCategory}
            onResetCategories={resetWorkoutCategories}
            onChangeWeeklyGoal={setWeeklyGoal}
            onExportBackup={exportBackupJson}
            onImportBackup={importBackupJson}
          />
        )}
      </main>

      {/* Fixed iOS Bottom 4-Tab Navigation Bar */}
      <nav
        aria-label="하단 탭 내비게이션"
        className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] z-30 bg-white/90 backdrop-blur-md border-t border-[#EAE3D5] pb-safe"
      >
        <div className="grid grid-cols-4 px-2 pt-2 pb-1">
          <button
            type="button"
            onClick={() => setActiveTab("calendar")}
            aria-current={activeTab === "calendar" ? "page" : undefined}
            className={`flex flex-col items-center justify-center gap-1 py-1 rounded-2xl transition ${
              activeTab === "calendar"
                ? "text-[#6CA824]"
                : "text-[#8C8479] hover:text-[#5B554C]"
            }`}
          >
            <span
              className={`px-3 py-1 rounded-full transition ${
                activeTab === "calendar" ? "bg-[#6CA824]/12" : ""
              }`}
            >
              <svg
                className="w-5 h-5"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <rect
                  x="3.5"
                  y="4.5"
                  width="17"
                  height="16"
                  rx="3.5"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                <path
                  d="M8 3V6M16 3V6M3.5 9.5H20.5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <path
                  d="M9 14.5L11.2 16.7L15.2 12.5"
                  stroke="currentColor"
                  strokeWidth="2.1"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span className="text-[11px] font-bold tracking-tight">
              운동 달력
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("leaderboard")}
            aria-current={activeTab === "leaderboard" ? "page" : undefined}
            className={`flex flex-col items-center justify-center gap-1 py-1 rounded-2xl transition ${
              activeTab === "leaderboard"
                ? "text-[#6CA824]"
                : "text-[#8C8479] hover:text-[#5B554C]"
            }`}
          >
            <span
              className={`px-3 py-1 rounded-full transition ${
                activeTab === "leaderboard" ? "bg-[#6CA824]/12" : ""
              }`}
            >
              <svg
                className="w-5 h-5"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M8 4.5H16V10C16 12.2091 14.2091 14 12 14C9.79086 14 8 12.2091 8 10V4.5Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
                <path
                  d="M8 6.5H5.5C4.94772 6.5 4.5 6.94772 4.5 7.5V8.5C4.5 9.88071 5.61929 11 7 11H8"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <path
                  d="M16 6.5H18.5C19.0523 6.5 19.5 6.94772 19.5 7.5V8.5C19.5 9.88071 18.3807 11 17 11H16"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <path
                  d="M12 14V18M8.5 19.5H15.5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <span className="text-[11px] font-bold tracking-tight">
              리더보드
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("profile")}
            aria-current={activeTab === "profile" ? "page" : undefined}
            className={`flex flex-col items-center justify-center gap-1 py-1 rounded-2xl transition ${
              activeTab === "profile"
                ? "text-[#6CA824]"
                : "text-[#8C8479] hover:text-[#5B554C]"
            }`}
          >
            <span
              className={`px-3 py-1 rounded-full transition ${
                activeTab === "profile" ? "bg-[#6CA824]/12" : ""
              }`}
            >
              <svg
                className="w-5 h-5"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <circle
                  cx="12"
                  cy="8.5"
                  r="3.75"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                <path
                  d="M5.5 19.25C6.6 15.95 9.1 14.5 12 14.5C14.9 14.5 17.4 15.95 18.5 19.25"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <span className="text-[11px] font-bold tracking-tight">프로필</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("settings")}
            aria-current={activeTab === "settings" ? "page" : undefined}
            className={`flex flex-col items-center justify-center gap-1 py-1 rounded-2xl transition ${
              activeTab === "settings"
                ? "text-[#6CA824]"
                : "text-[#8C8479] hover:text-[#5B554C]"
            }`}
          >
            <span
              className={`px-3 py-1 rounded-full transition ${
                activeTab === "settings" ? "bg-[#6CA824]/12" : ""
              }`}
            >
              <svg
                className="w-5 h-5"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <circle
                  cx="12"
                  cy="12"
                  r="3.25"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                <path
                  d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.08a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.08a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span className="text-[11px] font-bold tracking-tight">설정</span>
          </button>
        </div>
      </nav>
      </div>
    </PullToRefresh>
  );
}
