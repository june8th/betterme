const MS_PER_DAY = 86_400_000;

export function buildDateKey(year: number, monthIndex0: number, day: number): string {
  const y = String(year).padStart(4, "0");
  const m = String(monthIndex0 + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatDateKey(date: Date): string {
  return buildDateKey(date.getFullYear(), date.getMonth(), date.getDate());
}

export function getTodayKey(now?: Date): string {
  return formatDateKey(now ?? new Date());
}

export function getDaysInMonth(year: number, monthIndex0: number): number {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

export function isFutureDateKey(dateKey: string, todayKey?: string): boolean {
  return dateKey > (todayKey ?? getTodayKey());
}

function parseDateKeyToDayNumber(dateKey: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const monthIndex0 = Number(match[2]) - 1;
  const day = Number(match[3]);
  const utcMs = Date.UTC(year, monthIndex0, day);
  const check = new Date(utcMs);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== monthIndex0 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }
  return Math.floor(utcMs / MS_PER_DAY);
}

export function calculateStreaks(
  workouts: Record<string, { completed: boolean }>,
  todayKey?: string
): { currentStreak: number; bestStreak: number; totalCompleted: number } {
  const completedDaySet = new Set<number>();
  let nonStandardCompletedCount = 0;

  for (const [dateKey, entry] of Object.entries(workouts ?? {})) {
    if (!entry?.completed) {
      continue;
    }
    const dayNumber = parseDateKeyToDayNumber(dateKey);
    if (dayNumber !== null) {
      completedDaySet.add(dayNumber);
    } else {
      nonStandardCompletedCount += 1;
    }
  }

  const totalCompleted = completedDaySet.size + nonStandardCompletedCount;
  if (completedDaySet.size === 0) {
    return {
      currentStreak: 0,
      bestStreak: 0,
      totalCompleted,
    };
  }

  const resolvedTodayKey = todayKey ?? getTodayKey();
  const todayDayNumber =
    parseDateKeyToDayNumber(resolvedTodayKey) ??
    parseDateKeyToDayNumber(getTodayKey());

  let currentStreak = 0;
  if (todayDayNumber !== null) {
    let cursor: number | null = null;
    if (completedDaySet.has(todayDayNumber)) {
      cursor = todayDayNumber;
    } else if (completedDaySet.has(todayDayNumber - 1)) {
      cursor = todayDayNumber - 1;
    }

    while (cursor !== null && completedDaySet.has(cursor)) {
      currentStreak += 1;
      cursor -= 1;
    }
  }

  const sortedDays = Array.from(completedDaySet).sort((a, b) => a - b);
  let bestStreak = 0;
  let activeRun = 0;
  let prevDay: number | null = null;

  for (const dayNumber of sortedDays) {
    if (prevDay !== null && dayNumber === prevDay + 1) {
      activeRun += 1;
    } else {
      activeRun = 1;
    }
    if (activeRun > bestStreak) {
      bestStreak = activeRun;
    }
    prevDay = dayNumber;
  }

  return {
    currentStreak,
    bestStreak,
    totalCompleted,
  };
}

export function getMonthCompletedCount(
  workouts: Record<string, { completed: boolean }>,
  year: number,
  monthIndex0: number
): number {
  const prefix = `${String(year).padStart(4, "0")}-${String(monthIndex0 + 1).padStart(2, "0")}-`;
  const daysInMonth = getDaysInMonth(year, monthIndex0);
  let completedCount = 0;

  for (const [dateKey, entry] of Object.entries(workouts ?? {})) {
    if (!entry?.completed || dateKey.length !== 10 || !dateKey.startsWith(prefix)) {
      continue;
    }
    const day = Number(dateKey.slice(8, 10));
    if (Number.isInteger(day) && day >= 1 && day <= daysInMonth) {
      completedCount += 1;
    }
  }

  return completedCount;
}
