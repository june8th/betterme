"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { UserProfileData } from "@/lib/workout-types";
import { calculateStreaks } from "@/lib/date-utils";

export interface ProfileViewProps {
  profile: UserProfileData;
  savedNicknames: Array<{
    nickname: string;
    totalCompleted: number;
    updatedAt: string;
  }>;
  syncing: boolean;
  onSwitchNickname: (nickname: string) => Promise<void> | void;
  onRenameNickname: (newNickname: string) => Promise<boolean> | boolean;
  onLogout: () => void;
  onChangeWeeklyGoal: (goal: number) => Promise<void> | void;
  onExportBackup: () => string;
  onImportBackup: (rawJson: string) => Promise<{ ok: boolean; message: string }>;
}

const WEEKLY_GOALS = [1, 2, 3, 4, 5, 6, 7];

export default function ProfileView({
  profile,
  savedNicknames,
  syncing,
  onSwitchNickname,
  onRenameNickname,
  onLogout,
  onChangeWeeklyGoal,
  onExportBackup,
  onImportBackup,
}: ProfileViewProps) {
  const { currentStreak, bestStreak, totalCompleted } = useMemo(
    () => calculateStreaks(profile.workouts),
    [profile.workouts]
  );

  // Inline nickname rename state
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState(profile.nickname);
  const [renameBusy, setRenameBusy] = useState(false);
  const [renameFeedback, setRenameFeedback] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);

  // Switch / add new user state
  const [switchInput, setSwitchInput] = useState("");
  const [switchBusy, setSwitchBusy] = useState(false);

  // Collapsible backup & restore state
  const [backupOpen, setBackupOpen] = useState(false);
  const [backupInput, setBackupInput] = useState("");
  const [backupStatus, setBackupStatus] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);
  const [importBusy, setImportBusy] = useState(false);

  useEffect(() => {
    setRenameDraft(profile.nickname);
    setIsRenaming(false);
  }, [profile.nickname]);

  // Ensure current user always appears in the saved list
  const mergedUsers = useMemo(() => {
    const activeKey = profile.nickname.trim().toLowerCase();
    const exists = savedNicknames.some(
      (item) => item.nickname.trim().toLowerCase() === activeKey
    );
    if (exists) {
      return savedNicknames.map((item) =>
        item.nickname.trim().toLowerCase() === activeKey
          ? {
              nickname: profile.nickname,
              totalCompleted,
              updatedAt: profile.updatedAt,
            }
          : item
      );
    }
    return [
      {
        nickname: profile.nickname,
        totalCompleted,
        updatedAt: profile.updatedAt,
      },
      ...savedNicknames,
    ];
  }, [profile.nickname, profile.updatedAt, savedNicknames, totalCompleted]);

  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = renameDraft.trim();
    if (!trimmed) {
      setRenameFeedback({ ok: false, text: "변경할 닉네임을 입력해 주세요." });
      return;
    }
    if (trimmed === profile.nickname) {
      setIsRenaming(false);
      setRenameFeedback(null);
      return;
    }
    setRenameBusy(true);
    setRenameFeedback(null);
    try {
      const ok = await onRenameNickname(trimmed);
      if (ok) {
        setIsRenaming(false);
        setRenameFeedback({
          ok: true,
          text: `'${trimmed}'(으)로 닉네임이 변경되었어요 ✓`,
        });
      } else {
        setRenameFeedback({
          ok: false,
          text: "닉네임을 변경하지 못했어요. 다시 시도해 주세요.",
        });
      }
    } finally {
      setRenameBusy(false);
    }
  };

  const handleSwitchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = switchInput.trim();
    if (!trimmed || switchBusy) return;
    setSwitchBusy(true);
    try {
      await onSwitchNickname(trimmed);
      setSwitchInput("");
      setRenameFeedback(null);
    } finally {
      setSwitchBusy(false);
    }
  };

  const handleTapSavedUser = async (targetNickname: string) => {
    if (switchBusy) return;
    if (
      targetNickname.trim().toLowerCase() ===
      profile.nickname.trim().toLowerCase()
    ) {
      return;
    }
    setSwitchBusy(true);
    try {
      await onSwitchNickname(targetNickname);
      setRenameFeedback(null);
    } finally {
      setSwitchBusy(false);
    }
  };

  const handleCopyBackup = async () => {
    const raw = onExportBackup();
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(raw);
        setBackupStatus({
          ok: true,
          text: "클립보드에 백업 데이터가 복사되었어요 ✓",
        });
        return;
      }
    } catch {
      // Fallback below if clipboard permission is blocked
    }
    setBackupInput(raw);
    setBackupStatus({
      ok: true,
      text: "아래 입력창에 백업 JSON을 채워 두었어요. 전체 선택해 복사해 주세요.",
    });
  };

  const handleRestoreBackup = async () => {
    const trimmed = backupInput.trim();
    if (!trimmed) {
      setBackupStatus({
        ok: false,
        text: "복원할 백업 JSON 데이터를 먼저 붙여넣어 주세요.",
      });
      return;
    }
    setImportBusy(true);
    setBackupStatus(null);
    try {
      const res = await onImportBackup(trimmed);
      setBackupStatus({ ok: res.ok, text: res.message });
      if (res.ok) {
        setBackupInput("");
      }
    } finally {
      setImportBusy(false);
    }
  };

  const initialChar =
    profile.nickname.trim().slice(0, 1).toUpperCase() || "B";

  return (
    <div className="space-y-4 px-4 pt-3 pb-8">
      {/* 1. Current User Card */}
      <section className="rounded-[28px] bg-white p-5 border border-[#ECE5D8] shadow-[0_8px_30px_rgb(44,42,39,0.05)]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#79B82C] to-[#5B8E1D] text-white flex items-center justify-center text-xl font-bold shadow-[0_6px_16px_rgba(108,168,36,0.28)] shrink-0 ring-4 ring-[#6CA824]/15">
              {initialChar}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-[#2C2A27] truncate">
                  {profile.nickname}
                </h2>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                    syncing
                      ? "bg-[#F5EFE4] text-[#7A7267]"
                      : "bg-[#6CA824]/12 text-[#5B8E1D]"
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      syncing ? "bg-[#B59B6D] animate-pulse" : "bg-[#6CA824]"
                    }`}
                  />
                  {syncing ? "동기화 중..." : "자동 저장됨"}
                </span>
              </div>
              <p className="text-xs text-[#7D766B] mt-0.5">
                주 {profile.weeklyGoal}회 목표 · 나만의 운동 달력 프로필
              </p>
            </div>
          </div>
        </div>

        {/* Inline Rename Form or Action Buttons */}
        {isRenaming ? (
          <form onSubmit={handleRenameSubmit} className="mt-4 space-y-2.5">
            <label
              htmlFor="rename-nickname-input"
              className="block text-xs font-semibold text-[#5B554C]"
            >
              새 닉네임 입력
            </label>
            <div className="flex items-center gap-2">
              <input
                id="rename-nickname-input"
                type="text"
                value={renameDraft}
                onChange={(e) => setRenameDraft(e.target.value)}
                maxLength={24}
                autoFocus
                disabled={renameBusy}
                placeholder="변경할 닉네임"
                className="flex-1 min-w-0 rounded-xl bg-[#FAF7F2] border border-[#E4DDD0] px-3.5 py-2.5 text-[16px] text-[#2C2A27] focus:outline-none focus:border-[#6CA824] focus:ring-2 focus:ring-[#6CA824]/20"
              />
              <button
                type="submit"
                disabled={renameBusy}
                className="rounded-xl bg-[#6CA824] hover:bg-[#5E941E] text-white text-xs font-semibold px-3.5 py-3 shrink-0 transition"
              >
                {renameBusy ? "저장 중" : "저장"}
              </button>
              <button
                type="button"
                disabled={renameBusy}
                onClick={() => {
                  setIsRenaming(false);
                  setRenameDraft(profile.nickname);
                }}
                className="rounded-xl bg-[#F4F0E8] hover:bg-[#EAE3D5] text-[#5B554C] text-xs font-semibold px-3 py-3 shrink-0 transition"
              >
                취소
              </button>
            </div>
          </form>
        ) : (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setRenameDraft(profile.nickname);
                setRenameFeedback(null);
                setIsRenaming(true);
              }}
              className="rounded-xl bg-[#FAF7F2] hover:bg-[#F2ECE1] border border-[#E5DEC9] px-3.5 py-2 text-xs font-semibold text-[#4A453D] transition"
            >
              닉네임 이름 변경
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="rounded-xl bg-[#FAF7F2] hover:bg-[#F2ECE1] border border-[#E5DEC9] px-3.5 py-2 text-xs font-semibold text-[#7A7267] transition"
            >
              다른 닉네임 입력 화면으로
            </button>
          </div>
        )}

        {renameFeedback && (
          <p
            className={`mt-2.5 text-xs font-medium ${
              renameFeedback.ok ? "text-[#5B8E1D]" : "text-[#C94A38]"
            }`}
          >
            {renameFeedback.text}
          </p>
        )}
      </section>

      {/* 2. Personal Stats Summary */}
      <section className="grid grid-cols-3 gap-2.5">
        <div className="rounded-[24px] bg-white p-3.5 border border-[#ECE5D8] shadow-[0_6px_22px_rgb(44,42,39,0.04)] text-center">
          <p className="text-[11px] font-semibold text-[#7D766B]">
            총 운동 완료
          </p>
          <p className="mt-1.5 text-xl font-bold text-[#2C2A27]">
            {totalCompleted}
            <span className="text-xs font-semibold text-[#6CA824] ml-0.5">
              일 ✓
            </span>
          </p>
        </div>

        <div className="rounded-[24px] bg-white p-3.5 border border-[#ECE5D8] shadow-[0_6px_22px_rgb(44,42,39,0.04)] text-center">
          <p className="text-[11px] font-semibold text-[#7D766B]">현재 연속</p>
          <p className="mt-1.5 text-xl font-bold text-[#2C2A27]">
            {currentStreak}
            <span className="text-xs font-semibold text-[#5B8E1D] ml-0.5">
              일 🔥
            </span>
          </p>
        </div>

        <div className="rounded-[24px] bg-white p-3.5 border border-[#ECE5D8] shadow-[0_6px_22px_rgb(44,42,39,0.04)] text-center">
          <p className="text-[11px] font-semibold text-[#7D766B]">최고 연속</p>
          <p className="mt-1.5 text-xl font-bold text-[#2C2A27]">
            {bestStreak}
            <span className="text-xs font-semibold text-[#9C7A3C] ml-0.5">
              일 🏆
            </span>
          </p>
        </div>
      </section>

      {/* 3. Weekly Goal Selector */}
      <section className="rounded-[28px] bg-white p-5 border border-[#ECE5D8] shadow-[0_8px_30px_rgb(44,42,39,0.05)]">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-bold text-[#2C2A27]">주간 운동 목표</h3>
            <p className="text-xs text-[#7D766B] mt-0.5">
              일주일에 실천할 목표 운동 횟수를 선택하세요
            </p>
          </div>
          <span className="rounded-full bg-[#6CA824]/12 text-[#5B8E1D] text-xs font-bold px-2.5 py-1">
            주 {profile.weeklyGoal}회
          </span>
        </div>

        <div className="grid grid-cols-7 gap-1.5">
          {WEEKLY_GOALS.map((goal) => {
            const active = profile.weeklyGoal === goal;
            return (
              <button
                key={goal}
                type="button"
                onClick={() => onChangeWeeklyGoal(goal)}
                className={`rounded-2xl py-2.5 text-xs font-semibold transition flex flex-col items-center justify-center ${
                  active
                    ? "bg-[#6CA824] text-white shadow-[0_4px_12px_rgba(108,168,36,0.3)]"
                    : "bg-[#FAF7F2] text-[#5B554C] hover:bg-[#F1ECE2] border border-[#EAE3D5]"
                }`}
              >
                <span className="text-[10px] opacity-85">주</span>
                <span className="text-xs font-bold">{goal}회</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* 4. User Switcher / Add New User */}
      <section className="rounded-[28px] bg-white p-5 border border-[#ECE5D8] shadow-[0_8px_30px_rgb(44,42,39,0.05)]">
        <div className="mb-3">
          <h3 className="text-sm font-bold text-[#2C2A27]">
            사용자 전환 / 새 사용자 추가
          </h3>
          <p className="text-xs text-[#7D766B] mt-0.5">
            다른 닉네임을 탭하면 해당 사용자의 운동 달력으로 즉시 전환됩니다
          </p>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          {mergedUsers.map((user) => {
            const isCurrent =
              user.nickname.trim().toLowerCase() ===
              profile.nickname.trim().toLowerCase();
            return (
              <button
                key={user.nickname.toLowerCase()}
                type="button"
                disabled={switchBusy}
                onClick={() => handleTapSavedUser(user.nickname)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition ${
                  isCurrent
                    ? "bg-[#6CA824] text-white shadow-[0_4px_12px_rgba(108,168,36,0.25)]"
                    : "bg-[#FAF7F2] hover:bg-[#F1ECE2] text-[#2C2A27] border border-[#E5DEC9]"
                }`}
              >
                <span>{user.nickname}</span>
                <span
                  className={`text-[11px] ${
                    isCurrent ? "text-white/90" : "text-[#7D766B]"
                  }`}
                >
                  · {user.totalCompleted}회
                </span>
                {isCurrent && (
                  <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded-full">
                    현재
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <form onSubmit={handleSwitchSubmit} className="flex items-center gap-2">
          <input
            type="text"
            value={switchInput}
            onChange={(e) => setSwitchInput(e.target.value)}
            maxLength={24}
            placeholder="새 사용자 또는 다른 닉네임 입력"
            disabled={switchBusy}
            className="flex-1 min-w-0 rounded-2xl bg-[#FAF7F2] border border-[#E5DEC9] px-3.5 py-2.5 text-[16px] text-[#2C2A27] placeholder:text-[#A39C90] focus:outline-none focus:border-[#6CA824] focus:ring-2 focus:ring-[#6CA824]/20"
          />
          <button
            type="submit"
            disabled={switchBusy || !switchInput.trim()}
            className="rounded-2xl bg-[#2C2A27] hover:bg-[#3D3A36] disabled:opacity-45 text-white text-xs font-semibold px-4 py-3 shrink-0 transition"
          >
            다른 사용자로 전환
          </button>
        </form>
      </section>

      {/* 5. Collapsible Backup & Restore */}
      <section className="rounded-[28px] bg-white border border-[#ECE5D8] shadow-[0_8px_30px_rgb(44,42,39,0.05)] overflow-hidden">
        <button
          type="button"
          onClick={() => setBackupOpen((prev) => !prev)}
          className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-[#FAF7F2]/60 transition"
        >
          <div>
            <h3 className="text-sm font-bold text-[#2C2A27]">
              기록 백업 & 복원
            </h3>
            <p className="text-xs text-[#7D766B] mt-0.5">
              다른 기기로 운동 기록을 옮기거나 안전하게 보관하세요
            </p>
          </div>
          <span
            className={`w-7 h-7 rounded-full bg-[#FAF7F2] border border-[#EAE3D5] flex items-center justify-center text-[#5B554C] transition-transform ${
              backupOpen ? "rotate-180" : ""
            }`}
          >
            <svg
              className="w-4 h-4"
              viewBox="0 0 20 20"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M5.5 7.5L10 12L14.5 7.5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </button>

        {backupOpen && (
          <div className="px-5 pb-5 pt-1 border-t border-[#F2ECE1] space-y-3">
            <button
              type="button"
              onClick={handleCopyBackup}
              className="w-full rounded-2xl bg-[#FAF7F2] hover:bg-[#F1ECE2] border border-[#E5DEC9] py-3 px-4 text-xs font-semibold text-[#2C2A27] transition flex items-center justify-center gap-1.5"
            >
              <svg
                className="w-4 h-4 text-[#6CA824]"
                viewBox="0 0 20 20"
                fill="none"
                aria-hidden="true"
              >
                <rect
                  x="7"
                  y="7"
                  width="9"
                  height="9"
                  rx="2"
                  stroke="currentColor"
                  strokeWidth="1.7"
                />
                <path
                  d="M4 13V5C4 3.89543 4.89543 3 6 3H12"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                />
              </svg>
              <span>백업 데이터 복사</span>
            </button>

            <div className="space-y-2">
              <textarea
                rows={4}
                value={backupInput}
                onChange={(e) => setBackupInput(e.target.value)}
                placeholder="복사한 백업 JSON 데이터를 여기에 붙여넣어 주세요"
                className="w-full rounded-2xl bg-[#FAF7F2] border border-[#E5DEC9] p-3 text-[16px] leading-snug text-[#2C2A27] placeholder:text-[#A39C90] focus:outline-none focus:border-[#6CA824] focus:ring-2 focus:ring-[#6CA824]/20 resize-none"
              />
              <button
                type="button"
                disabled={importBusy}
                onClick={handleRestoreBackup}
                className="w-full rounded-2xl bg-[#6CA824] hover:bg-[#5E941E] disabled:opacity-60 text-white py-3 px-4 text-xs font-semibold shadow-[0_4px_14px_rgba(108,168,36,0.24)] transition"
              >
                {importBusy ? "복원하는 중..." : "백업 데이터 붙여넣어 복원"}
              </button>
            </div>

            {backupStatus && (
              <p
                className={`text-xs font-medium ${
                  backupStatus.ok ? "text-[#5B8E1D]" : "text-[#C94A38]"
                }`}
              >
                {backupStatus.text}
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
