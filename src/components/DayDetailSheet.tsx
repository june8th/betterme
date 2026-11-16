"use client";

import React, { useEffect, useState } from "react";
import {
  WorkoutCategory,
  WorkoutEntry,
  WORKOUT_CATEGORIES,
} from "@/lib/workout-types";

export interface DayDetailPayload {
  completed: boolean;
  category?: WorkoutCategory;
  durationMinutes?: number;
  note?: string;
}

export interface DayDetailSheetProps {
  isOpen: boolean;
  dateKey: string | null;
  entry?: WorkoutEntry;
  isToday?: boolean;
  onClose: () => void;
  onSave: (dateKey: string, detail: DayDetailPayload) => Promise<void> | void;
}

const QUICK_DURATIONS = [15, 30, 45, 60, 90] as const;

function parseDateKey(dateKey: string): {
  year: number;
  month: number;
  day: number;
} {
  const [y, m, d] = dateKey.split("-").map((part) => parseInt(part, 10));
  return {
    year: Number.isFinite(y) ? y : 2026,
    month: Number.isFinite(m) ? m : 1,
    day: Number.isFinite(d) ? d : 1,
  };
}

export default function DayDetailSheet({
  isOpen,
  dateKey,
  entry,
  isToday = false,
  onClose,
  onSave,
}: DayDetailSheetProps): JSX.Element | null {
  const [selectedCategory, setSelectedCategory] = useState<
    WorkoutCategory | undefined
  >(entry?.category);
  const [selectedDuration, setSelectedDuration] = useState<number | undefined>(
    entry?.durationMinutes
  );
  const [note, setNote] = useState<string>(entry?.note ?? "");
  const [submitting, setSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedCategory(entry?.category);
    setSelectedDuration(entry?.durationMinutes);
    setNote(entry?.note ?? "");
    setSubmitting(false);
  }, [isOpen, dateKey, entry]);

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !dateKey) {
    return null;
  }

  const { month, day } = parseDateKey(dateKey);
  const isCurrentlyCompleted = Boolean(entry?.completed);

  const handleSaveCompleted = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    try {
      const trimmedNote = note.trim().slice(0, 60);
      await onSave(dateKey, {
        completed: true,
        category: selectedCategory,
        durationMinutes: selectedDuration,
        note: trimmedNote.length > 0 ? trimmedNote : undefined,
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const handleUncheck = async () => {
    if (submitting) return;

    setSubmitting(true);
    try {
      await onSave(dateKey, {
        completed: false,
        category: undefined,
        durationMinutes: undefined,
        note: undefined,
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#231F1B]/45 backdrop-blur-[2px]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="day-detail-sheet-title"
    >
      <div
        className="w-full max-w-[430px] rounded-t-[28px] border-t border-[#ECE5D8] bg-[#FAF7F2] px-5 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] shadow-[0_-14px_40px_rgba(35,31,27,0.2)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag Indicator */}
        <div className="mx-auto mb-3.5 h-1.5 w-10 rounded-full bg-[#D9D1C3]" />

        {/* Header */}
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <h2
                id="day-detail-sheet-title"
                className="text-[20px] font-extrabold tracking-tight text-[#2C2A27]"
              >
                {month}월 {day}일 (Day {day})
              </h2>
              {isToday && (
                <span className="rounded-full bg-[#6FA827] px-2 py-0.5 text-[11px] font-bold text-white">
                  오늘
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {isCurrentlyCompleted ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-[#CBE2AC] bg-[#EAF4DC] px-2.5 py-0.5 text-xs font-semibold text-[#4E7E16]">
                  <span>✓</span>
                  <span>운동 완료됨</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#EFEAE0] px-2.5 py-0.5 text-xs font-medium text-[#6F685E]">
                  <span>미완료 · 상세 기록</span>
                </span>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[#EDE7DC] text-sm font-bold text-[#5C554B] transition active:scale-95"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSaveCompleted} className="space-y-4">
          {/* Category Chips */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-bold text-[#4A453E]">
                운동 종류
              </span>
              <span className="text-[11px] text-[#8E867B]">선택 사항</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {WORKOUT_CATEGORIES.map((cat) => {
                const active = selectedCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() =>
                      setSelectedCategory((prev) =>
                        prev === cat.id ? undefined : cat.id
                      )
                    }
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-semibold transition active:scale-95 ${
                      active
                        ? "border-[#6CA824] bg-[#6CA824] text-white shadow-[0_3px_10px_rgba(108,168,36,0.28)]"
                        : "border-[#E6DFD2] bg-white text-[#3F3A34] hover:border-[#CFC5B4]"
                    }`}
                  >
                    <span>{cat.label}</span>
                    <span>{cat.emoji}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quick Duration Pills */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-bold text-[#4A453E]">
                운동 시간
              </span>
              <span className="text-[11px] text-[#8E867B]">선택 사항</span>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {QUICK_DURATIONS.map((mins) => {
                const active = selectedDuration === mins;
                return (
                  <button
                    key={mins}
                    type="button"
                    onClick={() =>
                      setSelectedDuration((prev) =>
                        prev === mins ? undefined : mins
                      )
                    }
                    className={`rounded-xl border py-2 text-xs font-semibold transition active:scale-95 ${
                      active
                        ? "border-[#6CA824] bg-[#6CA824] text-white shadow-sm"
                        : "border-[#E6DFD2] bg-white text-[#4A453E] hover:border-[#CFC5B4]"
                    }`}
                  >
                    {mins}분
                  </button>
                );
              })}
            </div>
          </div>

          {/* 1-Line Memo Input */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label
                htmlFor="workout-day-note"
                className="text-xs font-bold text-[#4A453E]"
              >
                한 줄 메모
              </label>
              <span className="text-[11px] text-[#8E867B]">
                {note.length}/60
              </span>
            </div>
            <input
              id="workout-day-note"
              type="text"
              maxLength={60}
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 60))}
              placeholder="스쿼트 3세트 + 스트레칭 완료!"
              className="select-text w-full rounded-2xl border border-[#E6DFD2] bg-white px-4 py-3 text-base text-[#2C2A27] placeholder:text-[#ABA398] focus:border-[#6CA824] focus:outline-none focus:ring-2 focus:ring-[#6CA824]/20"
            />
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2.5 pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-2xl bg-[#6CA824] py-3.5 text-[15px] font-bold text-white shadow-[0_6px_18px_rgba(108,168,36,0.28)] transition hover:bg-[#5F961E] active:scale-[0.99] disabled:opacity-60"
            >
              운동 완료 저장 ✓
            </button>

            {isCurrentlyCompleted && (
              <button
                type="button"
                disabled={submitting}
                onClick={handleUncheck}
                className="w-full rounded-2xl border border-[#E4DDD0] bg-white py-3 text-sm font-semibold text-[#7A5448] transition hover:bg-[#F6F0EA] active:scale-[0.99] disabled:opacity-60"
              >
                체크 해제
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
