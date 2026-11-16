"use client";

import React, { useState } from "react";

export interface OnboardingViewProps {
  savedNicknames: Array<{
    nickname: string;
    totalCompleted: number;
    updatedAt: string;
  }>;
  onStart: (nickname: string) => Promise<void> | void;
}

const PREVIEW_DAYS = [
  { day: 1, status: "done" as const, bg: "from-[#EDE4D5] to-[#DFD3BF]" },
  { day: 2, status: "done" as const, bg: "from-[#E9E2D4] to-[#D9CEBA]" },
  { day: 3, status: "done" as const, bg: "from-[#EFE7DA] to-[#E1D5C3]" },
  { day: 4, status: "today" as const, bg: "from-[#F2EBE0] to-[#E4DAC9]" },
  { day: 5, status: "locked" as const, bg: "from-[#F5F2EC] to-[#ECE7DE]" },
];

export default function OnboardingView({
  savedNicknames,
  onStart,
}: OnboardingViewProps) {
  const [nicknameInput, setNicknameInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = nicknameInput.trim();
    if (!trimmed) {
      setErrorMsg("닉네임을 입력해 주세요.");
      return;
    }
    setErrorMsg(null);
    setSubmitting(true);
    try {
      await onStart(trimmed);
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickStart = async (targetNickname: string) => {
    if (submitting) return;
    setErrorMsg(null);
    setSubmitting(true);
    try {
      await onStart(targetNickname);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-dvh bg-[#FAF7F2] text-[#2C2A27] flex flex-col justify-between px-5 pt-safe pb-safe">
      <div className="pt-8 pb-6 flex-1 flex flex-col justify-center">
        {/* Brand Badge */}
        <div className="inline-flex items-center gap-2 self-start rounded-full bg-white border border-[#EAE3D5] px-3.5 py-1.5 shadow-[0_2px_10px_rgba(44,42,39,0.04)] mb-5">
          <span className="w-5 h-5 rounded-full bg-[#6CA824] flex items-center justify-center text-white shadow-sm">
            <svg
              className="w-3 h-3"
              viewBox="0 0 20 20"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M5 10.5L8.5 14L15 6.5"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="text-xs font-semibold tracking-tight text-[#4A463F]">
            betterme · 데일리 운동 스탬프
          </span>
        </div>

        {/* Motivational Headline */}
        <h1 className="text-[26px] leading-[1.32] font-bold tracking-tight text-[#2C2A27] mb-2.5">
          매일 나를 바꾸는 운동 기록,{" "}
          <span className="text-[#6CA824]">betterme</span>
        </h1>
        <p className="text-sm leading-relaxed text-[#6E685F] mb-6">
          하루 한 번 운동 완료 도장을 찍으며 나만의 운동 루틴을 채워 보세요.
          비밀번호 없이 닉네임만으로 내 달력이 자동 저장됩니다.
        </p>

        {/* Mini BetterMe Stamp Calendar Preview */}
        <div className="rounded-[26px] bg-white p-4 border border-[#ECE5D8] shadow-[0_8px_28px_rgba(44,42,39,0.05)] mb-6">
          <div className="flex items-center justify-between mb-3 px-0.5">
            <span className="text-xs font-semibold text-[#5B554C]">
              나만의 월간 운동 스탬프 보드
            </span>
            <span className="text-[11px] font-semibold text-[#6CA824] bg-[#6CA824]/10 px-2.5 py-0.5 rounded-full">
              🔥 3일 연속 달성 중
            </span>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {PREVIEW_DAYS.map((item) => (
              <div key={item.day} className="flex flex-col items-center gap-1">
                <div
                  className={`aspect-square w-full rounded-[15px] bg-gradient-to-br ${item.bg} relative flex items-center justify-center overflow-hidden ${
                    item.status === "today"
                      ? "ring-2 ring-[#6CA824] ring-offset-2 ring-offset-white"
                      : ""
                  } ${item.status === "locked" ? "opacity-75" : ""}`}
                >
                  {item.status === "done" && (
                    <span className="w-7 h-7 rounded-full bg-[#6CA824] ring-2 ring-white shadow-sm flex items-center justify-center text-white">
                      <svg
                        className="w-3.5 h-3.5"
                        viewBox="0 0 20 20"
                        fill="none"
                        aria-hidden="true"
                      >
                        <path
                          d="M5 10.5L8.5 14L15 6.5"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  )}
                  {item.status === "today" && (
                    <span className="text-[10px] font-bold tracking-tight text-[#5B8E1D] bg-white/90 px-1.5 py-0.5 rounded-full shadow-sm">
                      TODAY
                    </span>
                  )}
                  {item.status === "locked" && (
                    <span className="w-6 h-6 rounded-full bg-[#6B665E]/80 text-white flex items-center justify-center">
                      <svg
                        className="w-3 h-3"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        aria-hidden="true"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 2a4 4 0 00-4 4v2H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-1V6a4 4 0 00-4-4zm2 6V6a2 2 0 10-4 0v2h4z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </span>
                  )}
                </div>
                <span
                  className={`text-[11px] font-semibold ${
                    item.status === "today"
                      ? "text-[#5B8E1D]"
                      : "text-[#6B665E]"
                  }`}
                >
                  Day {item.day}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Nickname Form Card */}
        <form
          onSubmit={handleSubmit}
          className="rounded-[26px] bg-white p-5 border border-[#ECE5D8] shadow-[0_8px_28px_rgba(44,42,39,0.05)]"
        >
          <label
            htmlFor="betterme-nickname-input"
            className="block text-xs font-semibold text-[#5B554C] mb-2"
          >
            내 운동 프로필 닉네임
          </label>
          <input
            id="betterme-nickname-input"
            type="text"
            value={nicknameInput}
            onChange={(e) => {
              setNicknameInput(e.target.value);
              if (errorMsg) setErrorMsg(null);
            }}
            placeholder="닉네임을 입력해 주세요 (예: 지훈, june8th)"
            autoFocus
            maxLength={24}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            disabled={submitting}
            className="w-full rounded-2xl bg-[#FAF7F2] border border-[#E5DEC9] px-4 py-3.5 text-[16px] text-[#2C2A27] placeholder:text-[#A39C90] focus:outline-none focus:border-[#6CA824] focus:ring-2 focus:ring-[#6CA824]/20 transition"
          />
          {errorMsg && (
            <p className="mt-2 text-xs font-medium text-[#C94A38]">
              {errorMsg}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-3.5 w-full rounded-2xl bg-[#6CA824] hover:bg-[#5E941E] active:scale-[0.99] disabled:opacity-60 text-white font-semibold text-[15px] py-3.5 px-4 shadow-[0_6px_18px_rgba(108,168,36,0.28)] transition flex items-center justify-center gap-1.5"
          >
            <span>
              {submitting ? "운동 달력 불러오는 중..." : "운동 기록 시작하기 →"}
            </span>
          </button>
        </form>

        {/* Saved Users Quick Switch */}
        {savedNicknames.length > 0 && (
          <div className="mt-5 rounded-[24px] bg-[#F4EFE6]/80 border border-[#EAE3D5] p-4">
            <p className="text-xs font-semibold text-[#5B554C] mb-2.5">
              저장된 사용자로 바로 시작하기
            </p>
            <div className="flex flex-wrap gap-2">
              {savedNicknames.map((user) => (
                <button
                  key={user.nickname.toLowerCase()}
                  type="button"
                  disabled={submitting}
                  onClick={() => handleQuickStart(user.nickname)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white hover:bg-[#FAF7F2] active:scale-[0.98] border border-[#E4DDD0] px-3.5 py-2 text-xs font-semibold text-[#2C2A27] shadow-sm transition"
                >
                  <span className="w-4 h-4 rounded-full bg-[#6CA824]/15 text-[#5B8E1D] flex items-center justify-center text-[10px] font-bold">
                    {user.nickname.slice(0, 1).toUpperCase()}
                  </span>
                  <span>
                    {user.nickname} · {user.totalCompleted}회
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <p className="text-center text-[11px] text-[#9A9286] pb-3">
        닉네임별로 각각의 운동 달력과 연속 기록이 안전하게 구분됩니다.
      </p>
    </div>
  );
}
