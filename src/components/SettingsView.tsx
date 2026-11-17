"use client";

import React, { useEffect, useState } from "react";
import type {
  UserProfileData,
  WorkoutCategory,
  WorkoutCategoryMeta,
} from "@/lib/workout-types";
import { matchWorkoutEmoji } from "@/lib/emoji-matcher";

export interface SettingsViewProps {
  profile: UserProfileData;
  syncing: boolean;
  onAddCategory: (
    label: string
  ) => Promise<{ ok: boolean; message?: string; category?: WorkoutCategoryMeta }>;
  onRemoveCategory: (categoryId: WorkoutCategory) => Promise<void>;
  onMoveCategory: (
    categoryId: WorkoutCategory,
    direction: "up" | "down"
  ) => Promise<void>;
  onResetCategories: () => Promise<void>;
  onChangeWeeklyGoal: (goal: number) => Promise<void> | void;
  onExportBackup: () => string;
  onImportBackup: (rawJson: string) => Promise<{ ok: boolean; message: string }>;
}

const WEEKLY_GOALS = [1, 2, 3, 4, 5, 6, 7];

export default function SettingsView({
  profile,
  syncing,
  onAddCategory,
  onRemoveCategory,
  onMoveCategory,
  onResetCategories,
  onChangeWeeklyGoal,
  onExportBackup,
  onImportBackup,
}: SettingsViewProps) {
  const categories = profile.categories ?? [];

  // Section 1: Workout Category Management state
  const [newCategoryInput, setNewCategoryInput] = useState("");
  const [categoryBusy, setCategoryBusy] = useState(false);
  const [categoryFeedback, setCategoryFeedback] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);

  // Section 3: Collapsible Backup & Restore state
  const [backupOpen, setBackupOpen] = useState(false);
  const [backupInput, setBackupInput] = useState("");
  const [backupStatus, setBackupStatus] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);
  const [importBusy, setImportBusy] = useState(false);

  // Clear transient inputs/feedback when switching active user
  useEffect(() => {
    setNewCategoryInput("");
    setCategoryFeedback(null);
    setBackupStatus(null);
  }, [profile.nickname]);

  const previewEmoji = newCategoryInput.trim()
    ? matchWorkoutEmoji(newCategoryInput, profile.categories)
    : "✨";

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newCategoryInput.trim();
    if (!trimmed) {
      setCategoryFeedback({
        ok: false,
        text: "추가할 운동 이름을 입력해 주세요.",
      });
      return;
    }
    if (categoryBusy) return;

    setCategoryBusy(true);
    setCategoryFeedback(null);
    try {
      const res = await onAddCategory(trimmed);
      if (res.ok) {
        setNewCategoryInput("");
        setCategoryFeedback({
          ok: true,
          text:
            res.message ??
            (res.category
              ? `${res.category.emoji} '${res.category.label}' 운동이 추가되었어요 ✓`
              : "새 운동 종류가 추가되었어요 ✓"),
        });
      } else {
        setCategoryFeedback({
          ok: false,
          text: res.message ?? "운동 종류를 추가하지 못했어요.",
        });
      }
    } finally {
      setCategoryBusy(false);
    }
  };

  const handleMove = async (
    categoryId: WorkoutCategory,
    direction: "up" | "down"
  ) => {
    if (categoryBusy) return;
    setCategoryBusy(true);
    setCategoryFeedback(null);
    try {
      await onMoveCategory(categoryId, direction);
    } finally {
      setCategoryBusy(false);
    }
  };

  const handleRemove = async (cat: WorkoutCategoryMeta) => {
    if (categoryBusy) return;
    setCategoryBusy(true);
    setCategoryFeedback(null);
    try {
      await onRemoveCategory(cat.id);
      setCategoryFeedback({
        ok: true,
        text: `'${cat.label}' 항목이 목록에서 삭제되었어요.`,
      });
    } finally {
      setCategoryBusy(false);
    }
  };

  const handleReset = async () => {
    if (categoryBusy) return;
    setCategoryBusy(true);
    setCategoryFeedback(null);
    try {
      await onResetCategories();
      setCategoryFeedback({
        ok: true,
        text: "기본 5가지 운동 종류로 복원되었어요 ✓",
      });
    } finally {
      setCategoryBusy(false);
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

  return (
    <div className="space-y-4 px-4 pt-3 pb-8">
      {/* Per-User Settings Ownership Banner */}
      <section className="rounded-[24px] bg-white/90 px-4 py-3.5 border border-[#ECE5D8] shadow-[0_6px_22px_rgb(44,42,39,0.04)]">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="min-w-0">
            <h2 className="text-[15px] font-extrabold text-[#2C2A27] truncate">
              {profile.nickname}님의 개인 맞춤 설정
            </h2>
            <p className="text-xs text-[#7D766B] mt-0.5">
              운동 종류와 목표는 {profile.nickname}님 계정에만 독립 적용됩니다
            </p>
          </div>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold shrink-0 ${
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
      </section>

      {/* 1. Workout Category Management */}
      <section className="rounded-[28px] bg-white p-5 border border-[#ECE5D8] shadow-[0_8px_30px_rgb(44,42,39,0.05)]">
        <div className="flex items-start justify-between gap-3 mb-3.5">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-[#2C2A27]">
                운동 종류 관리
              </h3>
              <span className="rounded-full bg-[#FAF7F2] border border-[#EAE3D5] px-2 py-0.5 text-[11px] font-bold text-[#5B554C]">
                {categories.length}개
              </span>
            </div>
            <p className="text-xs text-[#7D766B] mt-0.5">
              이름만 입력하면 어울리는 이모지가 자동으로 지정돼요
            </p>
          </div>

          <button
            type="button"
            disabled={categoryBusy}
            onClick={handleReset}
            className="rounded-xl bg-[#FAF7F2] hover:bg-[#F1ECE2] disabled:opacity-50 border border-[#E5DEC9] px-3 py-1.5 text-xs font-semibold text-[#5B554C] shrink-0 transition active:scale-95"
          >
            기본값 복원
          </button>
        </div>

        {/* Add Workout Form with Non-Interactive Auto-Emoji Preview Badge */}
        <form onSubmit={handleAddSubmit} className="flex items-center gap-2">
          <div className="flex-1 min-w-0 flex items-center gap-2 rounded-2xl bg-[#FAF7F2] border border-[#E5DEC9] pl-2.5 pr-3 focus-within:border-[#6CA824] focus-within:ring-2 focus-within:ring-[#6CA824]/20 transition">
            <span
              aria-hidden="true"
              className="w-8 h-8 rounded-xl bg-white border border-[#EAE3D5] flex items-center justify-center text-[17px] leading-none shrink-0 select-none pointer-events-none shadow-sm"
            >
              {previewEmoji}
            </span>
            <input
              type="text"
              value={newCategoryInput}
              onChange={(e) => setNewCategoryInput(e.target.value)}
              maxLength={24}
              disabled={categoryBusy}
              placeholder="예: 수영, 필라테스, 테니스, 등산"
              aria-label="새 운동 종류 이름"
              className="flex-1 min-w-0 bg-transparent py-2.5 text-[16px] text-[#2C2A27] placeholder:text-[#A39C90] focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={categoryBusy || !newCategoryInput.trim()}
            className="rounded-2xl bg-[#6CA824] hover:bg-[#5E941E] disabled:opacity-45 text-white text-xs font-bold px-4 py-3.5 shrink-0 shadow-[0_4px_12px_rgba(108,168,36,0.24)] transition active:scale-95"
          >
            추가
          </button>
        </form>

        {categoryFeedback && (
          <p
            className={`mt-2.5 text-xs font-medium ${
              categoryFeedback.ok ? "text-[#5B8E1D]" : "text-[#C94A38]"
            }`}
          >
            {categoryFeedback.text}
          </p>
        )}

        {/* Active Category List */}
        {categories.length === 0 ? (
          <div className="mt-4 rounded-2xl bg-[#FAF7F2] border border-dashed border-[#E2D9C8] px-4 py-5 text-center">
            <p className="text-xs font-semibold text-[#5B554C]">
              현재 등록된 운동 종류가 없어요.
            </p>
            <p className="text-[11px] text-[#8C8479] mt-1">
              위 입력창에서 새 운동을 추가하거나 ‘기본값 복원’을 눌러보세요.
            </p>
          </div>
        ) : (
          <ul className="mt-4 space-y-2" aria-label="활성 운동 종류 목록">
            {categories.map((cat, index) => {
              const isFirst = index === 0;
              const isLast = index === categories.length - 1;

              return (
                <li
                  key={cat.id}
                  className="flex items-center justify-between gap-2 rounded-2xl bg-[#FAF7F2] border border-[#EAE3D5] px-3 py-2.5"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      aria-hidden="true"
                      className="w-8 h-8 rounded-xl bg-white border border-[#EAE3D5] flex items-center justify-center text-base shrink-0"
                    >
                      {cat.emoji}
                    </span>
                    <span className="text-sm font-semibold text-[#2C2A27] truncate">
                      {cat.label}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      disabled={categoryBusy || isFirst}
                      onClick={() => handleMove(cat.id, "up")}
                      aria-label={`${cat.label} 위로 이동`}
                      className="w-8 h-8 rounded-xl bg-white hover:bg-[#F2ECE1] disabled:opacity-35 border border-[#E5DEC9] flex items-center justify-center text-xs font-bold text-[#4A453D] transition active:scale-95"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      disabled={categoryBusy || isLast}
                      onClick={() => handleMove(cat.id, "down")}
                      aria-label={`${cat.label} 아래로 이동`}
                      className="w-8 h-8 rounded-xl bg-white hover:bg-[#F2ECE1] disabled:opacity-35 border border-[#E5DEC9] flex items-center justify-center text-xs font-bold text-[#4A453D] transition active:scale-95"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      disabled={categoryBusy}
                      onClick={() => handleRemove(cat)}
                      aria-label={`${cat.label} 삭제`}
                      className="rounded-xl bg-white hover:bg-[#FDF0ED] disabled:opacity-40 border border-[#EBD4CE] px-2.5 h-8 text-xs font-semibold text-[#C04836] transition active:scale-95"
                    >
                      삭제
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-3.5 text-[11px] leading-relaxed text-[#7D766B] bg-[#FAF7F2]/80 rounded-xl px-3 py-2 border border-[#F0E9DC]">
          항목을 삭제하거나 초기화해도 이미 기록된 지난 운동의 이름과 이모지는 그대로 보존됩니다.
        </p>
      </section>

      {/* 2. Weekly Goal Selector */}
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

      {/* 3. Collapsible Backup & Restore */}
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
