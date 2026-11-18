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
  onDeleteNickname?: (nickname: string) => Promise<boolean> | boolean;
  onRefreshDirectory?: () => Promise<void> | void;
  onLogout: () => void;
}

export default function ProfileView({
  profile,
  savedNicknames,
  syncing,
  onSwitchNickname,
  onRenameNickname,
  onDeleteNickname,
  onRefreshDirectory,
  onLogout,
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
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null);
  const [deleteBusyKey, setDeleteBusyKey] = useState<string | null>(null);
  const [switchFeedback, setSwitchFeedback] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);

  useEffect(() => {
    setRenameDraft(profile.nickname);
    setIsRenaming(false);
    setConfirmDeleteKey(null);
  }, [profile.nickname]);

  useEffect(() => {
    void onRefreshDirectory?.();
  }, [onRefreshDirectory]);

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
    setSwitchFeedback(null);
    setConfirmDeleteKey(null);
    try {
      await onSwitchNickname(trimmed);
      setSwitchInput("");
      setRenameFeedback(null);
    } finally {
      setSwitchBusy(false);
    }
  };

  const handleTapSavedUser = async (targetNickname: string) => {
    if (switchBusy || deleteBusyKey) return;
    if (
      targetNickname.trim().toLowerCase() ===
      profile.nickname.trim().toLowerCase()
    ) {
      return;
    }
    setSwitchBusy(true);
    setSwitchFeedback(null);
    setConfirmDeleteKey(null);
    try {
      await onSwitchNickname(targetNickname);
      setRenameFeedback(null);
    } finally {
      setSwitchBusy(false);
    }
  };

  const handleConfirmDeleteUser = async (targetNickname: string) => {
    if (!onDeleteNickname || deleteBusyKey || switchBusy) return;
    const targetKey = targetNickname.trim().toLowerCase();
    setDeleteBusyKey(targetKey);
    setSwitchFeedback(null);
    try {
      const ok = await onDeleteNickname(targetNickname);
      setConfirmDeleteKey(null);
      if (ok) {
        setSwitchFeedback({
          ok: true,
          text: `'${targetNickname}' 프로필이 정리되었어요 ✓`,
        });
      } else {
        setSwitchFeedback({
          ok: false,
          text: "현재 사용 중인 프로필은 삭제할 수 없어요.",
        });
      }
    } finally {
      setDeleteBusyKey(null);
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

      {/* 3. User Switcher / Add New User */}
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
            const userKey = user.nickname.trim().toLowerCase();
            const isCurrent =
              userKey === profile.nickname.trim().toLowerCase();
            const isConfirming = confirmDeleteKey === userKey;
            const isDeleting = deleteBusyKey === userKey;

            if (!isCurrent && onDeleteNickname && isConfirming) {
              return (
                <div
                  key={userKey}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[#FDF2F0] border border-[#F0C8C1] pl-3 pr-1.5 py-1 text-xs"
                >
                  <span className="font-semibold text-[#7A352A]">
                    {user.nickname} 삭제할까요?
                  </span>
                  <button
                    type="button"
                    disabled={isDeleting}
                    onClick={() => handleConfirmDeleteUser(user.nickname)}
                    className="rounded-full bg-[#C94A38] hover:bg-[#B23E2E] disabled:opacity-60 px-2.5 py-1 text-[11px] font-bold text-white transition"
                  >
                    {isDeleting ? "삭제 중" : "삭제 확인"}
                  </button>
                  <button
                    type="button"
                    disabled={isDeleting}
                    onClick={() => setConfirmDeleteKey(null)}
                    className="rounded-full bg-white border border-[#E5DEC9] px-2.5 py-1 text-[11px] font-semibold text-[#5B554C] transition"
                  >
                    취소
                  </button>
                </div>
              );
            }

            return (
              <div
                key={userKey}
                className={`inline-flex items-center rounded-full transition ${
                  isCurrent
                    ? "bg-[#6CA824] text-white shadow-[0_4px_12px_rgba(108,168,36,0.25)]"
                    : "bg-[#FAF7F2] text-[#2C2A27] border border-[#E5DEC9]"
                }`}
              >
                <button
                  type="button"
                  disabled={switchBusy || Boolean(deleteBusyKey)}
                  onClick={() => handleTapSavedUser(user.nickname)}
                  className={`inline-flex items-center gap-1.5 py-2 text-xs font-semibold transition ${
                    isCurrent
                      ? "px-3.5"
                      : onDeleteNickname
                      ? "pl-3.5 pr-1.5 hover:bg-[#F1ECE2] rounded-l-full"
                      : "px-3.5 hover:bg-[#F1ECE2] rounded-full"
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
                {!isCurrent && onDeleteNickname && (
                  <button
                    type="button"
                    disabled={switchBusy || Boolean(deleteBusyKey)}
                    onClick={() => {
                      setSwitchFeedback(null);
                      setConfirmDeleteKey(userKey);
                    }}
                    aria-label={`${user.nickname} 프로필 삭제`}
                    className="pr-2.5 pl-1 py-2 text-[11px] font-bold text-[#9B9285] hover:text-[#C94A38] transition rounded-r-full"
                  >
                    ✕
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {switchFeedback && (
          <p
            className={`mb-3 text-xs font-medium ${
              switchFeedback.ok ? "text-[#5B8E1D]" : "text-[#C94A38]"
            }`}
          >
            {switchFeedback.text}
          </p>
        )}

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
    </div>
  );
}
