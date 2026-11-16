"use client";

import { useState } from "react";

type TabKey = "home" | "routine" | "growth" | "settings";

export default function HomePage() {
  const [checkInCount, setCheckInCount] = useState<number>(1);
  const [checkedInToday, setCheckedInToday] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<TabKey>("home");

  const handleCheckIn = () => {
    setCheckedInToday(true);
    setCheckInCount((prev) => prev + 1);
  };

  return (
    <div className="flex flex-col flex-1 min-h-dvh justify-between bg-slate-50 text-slate-900">
      {/* Top iOS-style Header Bar */}
      <header className="pt-safe sticky top-0 z-20 bg-white/85 backdrop-blur-md border-b border-slate-200/80 px-5 pb-3.5 transition-all">
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-600 via-indigo-500 to-slate-900 flex items-center justify-center text-white font-bold text-base shadow-sm shadow-indigo-500/20">
              B
            </div>
            <div>
              <span className="text-lg font-extrabold tracking-tight text-slate-900">
                betterme
              </span>
            </div>
          </div>

          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            v0.1 · Mobile Ready
          </span>
        </div>
      </header>

      {/* Main Scrollable Content Area */}
      <main className="flex-1 overflow-y-auto no-scrollbar px-5 py-6 flex flex-col gap-5">
        {/* Hero Card: Hello World */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white p-6 shadow-xl shadow-indigo-950/15 border border-white/10">
          <div className="absolute -right-8 -top-8 h-36 w-36 rounded-full bg-indigo-500/20 blur-2xl pointer-events-none" />
          <div className="absolute -left-8 -bottom-8 h-32 w-32 rounded-full bg-sky-400/15 blur-2xl pointer-events-none" />

          <div className="relative z-10 flex flex-col gap-4">
            <div className="inline-flex items-center gap-1.5 self-start rounded-full bg-white/10 backdrop-blur-sm px-3 py-1 text-xs font-medium text-indigo-200 border border-white/10">
              <span>✨ First Launch</span>
              <span>·</span>
              <span>iOS Web App</span>
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-widest text-indigo-300">
                Welcome to betterme
              </p>
              <h1 className="text-4xl font-black tracking-tight text-white">
                Hello World! 🚀
              </h1>
              <p className="text-sm font-medium text-slate-200 pt-1 leading-relaxed">
                더 나은 나를 만드는 시작, <span className="text-white font-semibold">betterme</span>
              </p>
              <p className="text-xs text-slate-300/90 leading-relaxed">
                Make a better me, every single day. 아이폰과 모바일 화면에 최적화된 첫 번째 웰컴 스크린입니다.
              </p>
            </div>

            {/* Interactive Touch Element */}
            <div className="pt-2 flex items-center justify-between gap-3 border-t border-white/10 mt-1">
              <div className="flex flex-col">
                <span className="text-[11px] text-indigo-200/80 font-medium">
                  오늘의 응원 탭 카운터
                </span>
                <span className="text-sm font-bold text-white">
                  {checkedInToday
                    ? `오늘 체크인 완료! (+${checkInCount}회)`
                    : `탭하여 첫 인사 남기기 (${checkInCount})`}
                </span>
              </div>

              <button
                type="button"
                onClick={handleCheckIn}
                className="active:scale-95 transition-transform duration-150 rounded-2xl bg-white text-slate-900 hover:bg-indigo-50 px-4 py-2.5 text-xs font-bold shadow-md shadow-black/20 flex items-center gap-1.5 shrink-0"
              >
                <span>👏 반가워요</span>
                <span className="inline-flex items-center justify-center rounded-full bg-indigo-600 text-white text-[11px] px-1.5 py-0.5 min-w-[20px]">
                  {checkInCount}
                </span>
              </button>
            </div>
          </div>
        </section>

        {/* Status / Environment Info Pills */}
        <section aria-label="System Readiness" className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-white p-3.5 shadow-sm border border-slate-200/70 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3"
                />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-slate-400 truncate">
                Device Target
              </p>
              <p className="text-xs font-bold text-slate-800 truncate">
                iPhone PWA Ready
              </p>
            </div>
          </div>

          <div className="rounded-2xl bg-white p-3.5 shadow-sm border border-slate-200/70 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-slate-400 truncate">
                Deployment
              </p>
              <p className="text-xs font-bold text-slate-800 truncate">
                GitHub & Vercel Ready
              </p>
            </div>
          </div>
        </section>

        {/* Daily Quick Preview Card */}
        <section className="rounded-2xl bg-white p-4 shadow-sm border border-slate-200/70 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              모바일 시작 가이드
            </h2>
            <span className="text-[11px] font-semibold text-indigo-600">
              iOS 홈 화면 추가 지원
            </span>
          </div>

          <div className="space-y-2 text-xs text-slate-600 leading-relaxed">
            <div className="flex items-center gap-2.5 rounded-xl bg-slate-50 p-2.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white text-[11px] font-bold">
                1
              </span>
              <span>
                아이폰 Safari에서 접속 후 <strong>공유 → 홈 화면에 추가</strong>를 눌러 앱처럼 실행해보세요.
              </span>
            </div>
            <div className="flex items-center gap-2.5 rounded-xl bg-slate-50 p-2.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-white text-[11px] font-bold">
                2
              </span>
              <span>
                하단 탭 바를 터치하여 <strong>홈 · 루틴 · 성장 · 설정</strong> 화면 전환을 테스트할 수 있습니다.
              </span>
            </div>
          </div>

          <div className="pt-1 flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-100">
            <span>현재 선택된 탭</span>
            <span className="font-semibold text-slate-700">
              {activeTab === "home" && "홈 (Home)"}
              {activeTab === "routine" && "루틴 (Routine)"}
              {activeTab === "growth" && "성장 (Growth)"}
              {activeTab === "settings" && "설정 (Settings)"}
            </span>
          </div>
        </section>
      </main>

      {/* Bottom iOS-style Tab Bar */}
      <nav
        aria-label="Bottom Navigation"
        className="pb-safe sticky bottom-0 z-20 bg-white/90 backdrop-blur-md border-t border-slate-200/80 px-4 pt-2"
      >
        <div className="grid grid-cols-4 gap-1">
          <button
            type="button"
            onClick={() => setActiveTab("home")}
            className={`flex flex-col items-center justify-center py-1.5 rounded-xl transition-colors ${
              activeTab === "home"
                ? "text-indigo-600 font-semibold"
                : "text-slate-400 hover:text-slate-600"
            }`}
          >
            <svg
              className="h-5 w-5 mb-0.5"
              fill={activeTab === "home" ? "currentColor" : "none"}
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"
              />
            </svg>
            <span className="text-[11px]">홈</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("routine")}
            className={`flex flex-col items-center justify-center py-1.5 rounded-xl transition-colors ${
              activeTab === "routine"
                ? "text-indigo-600 font-semibold"
                : "text-slate-400 hover:text-slate-600"
            }`}
          >
            <svg
              className="h-5 w-5 mb-0.5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span className="text-[11px]">루틴</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("growth")}
            className={`flex flex-col items-center justify-center py-1.5 rounded-xl transition-colors ${
              activeTab === "growth"
                ? "text-indigo-600 font-semibold"
                : "text-slate-400 hover:text-slate-600"
            }`}
          >
            <svg
              className="h-5 w-5 mb-0.5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605"
              />
            </svg>
            <span className="text-[11px]">성장</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("settings")}
            className={`flex flex-col items-center justify-center py-1.5 rounded-xl transition-colors ${
              activeTab === "settings"
                ? "text-indigo-600 font-semibold"
                : "text-slate-400 hover:text-slate-600"
            }`}
          >
            <svg
              className="h-5 w-5 mb-0.5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            <span className="text-[11px]">설정</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
