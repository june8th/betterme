"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isFutureDateKey } from "@/lib/date-utils";
import {
  UserProfileData,
  WORKOUT_CATEGORIES,
  WorkoutCategory,
  WorkoutEntry,
} from "@/lib/workout-types";

export interface UseWorkoutStoreResult {
  hydrated: boolean;
  syncing: boolean;
  activeNickname: string | null;
  profile: UserProfileData | null;
  savedNicknames: Array<{
    nickname: string;
    totalCompleted: number;
    updatedAt: string;
  }>;
  loginWithNickname: (nickname: string) => Promise<void>;
  logoutNickname: () => void;
  renameActiveNickname: (newNickname: string) => Promise<boolean>;
  setWeeklyGoal: (goal: number) => Promise<void>;
  toggleWorkoutDay: (dateKey: string) => Promise<boolean>;
  saveWorkoutDetail: (
    dateKey: string,
    detail: {
      completed: boolean;
      category?: WorkoutCategory;
      durationMinutes?: number;
      note?: string;
    }
  ) => Promise<void>;
  exportBackupJson: () => string;
  importBackupJson: (rawJson: string) => Promise<{ ok: boolean; message: string }>;
}

interface SavedNicknameItem {
  nickname: string;
  totalCompleted: number;
  updatedAt: string;
}

interface LocalStoreState {
  activeNickname: string | null;
  profiles: Record<string, UserProfileData>;
}

interface WorkoutsApiResponse {
  ok?: boolean;
  profile?: UserProfileData | null;
  savedNicknames?: SavedNicknameItem[];
}

const STORAGE_KEY = "betterme_store_v1";

const VALID_CATEGORIES = new Set<WorkoutCategory>(
  WORKOUT_CATEGORIES.map((item) => item.id)
);

function normalizeNicknameKey(nickname: string): string {
  return nickname.trim().toLowerCase();
}

function compareIsoTimestamps(a?: string, b?: string): number {
  const parsedA = a ? Date.parse(a) : Number.NaN;
  const parsedB = b ? Date.parse(b) : Number.NaN;
  if (!Number.isNaN(parsedA) && !Number.isNaN(parsedB) && parsedA !== parsedB) {
    return parsedA - parsedB;
  }
  return String(a ?? "").localeCompare(String(b ?? ""));
}

function sanitizeWorkoutEntry(
  dateKey: string,
  raw: Partial<WorkoutEntry> | undefined,
  fallbackIso: string
): WorkoutEntry | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const resolvedDate =
    typeof raw.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.date)
      ? raw.date
      : dateKey;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(resolvedDate)) {
    return null;
  }

  const category =
    typeof raw.category === "string" &&
    VALID_CATEGORIES.has(raw.category as WorkoutCategory)
      ? (raw.category as WorkoutCategory)
      : undefined;

  const durationMinutes =
    typeof raw.durationMinutes === "number" &&
    Number.isFinite(raw.durationMinutes) &&
    raw.durationMinutes > 0
      ? Math.round(raw.durationMinutes)
      : undefined;

  const note =
    typeof raw.note === "string" && raw.note.trim().length > 0
      ? raw.note.trim().slice(0, 120)
      : undefined;

  const updatedAt =
    typeof raw.updatedAt === "string" && raw.updatedAt.trim().length > 0
      ? raw.updatedAt
      : fallbackIso;

  return {
    date: resolvedDate,
    completed: Boolean(raw.completed),
    ...(category ? { category } : {}),
    ...(durationMinutes !== undefined ? { durationMinutes } : {}),
    ...(note ? { note } : {}),
    updatedAt,
  };
}

function sanitizeProfile(
  raw: Partial<UserProfileData> | undefined,
  fallbackIso: string
): UserProfileData | null {
  if (!raw || typeof raw !== "object" || typeof raw.nickname !== "string") {
    return null;
  }
  const nickname = raw.nickname.trim();
  if (!nickname) {
    return null;
  }

  const createdAt =
    typeof raw.createdAt === "string" && raw.createdAt.trim().length > 0
      ? raw.createdAt
      : fallbackIso;
  const updatedAt =
    typeof raw.updatedAt === "string" && raw.updatedAt.trim().length > 0
      ? raw.updatedAt
      : fallbackIso;
  const weeklyGoal =
    typeof raw.weeklyGoal === "number" &&
    Number.isFinite(raw.weeklyGoal) &&
    raw.weeklyGoal >= 1 &&
    raw.weeklyGoal <= 7
      ? Math.round(raw.weeklyGoal)
      : 4;

  const workouts: Record<string, WorkoutEntry> = {};
  if (raw.workouts && typeof raw.workouts === "object") {
    for (const [dateKey, entry] of Object.entries(raw.workouts)) {
      const cleanEntry = sanitizeWorkoutEntry(dateKey, entry, updatedAt);
      if (cleanEntry) {
        workouts[cleanEntry.date] = cleanEntry;
      }
    }
  }

  return {
    nickname,
    createdAt,
    updatedAt,
    weeklyGoal,
    workouts,
  };
}

function mergeWorkouts(
  baseWorkouts: Record<string, WorkoutEntry>,
  incomingWorkouts: Record<string, WorkoutEntry>
): Record<string, WorkoutEntry> {
  const merged: Record<string, WorkoutEntry> = { ...baseWorkouts };
  for (const [dateKey, incomingEntry] of Object.entries(incomingWorkouts)) {
    const existingEntry = merged[dateKey];
    if (
      !existingEntry ||
      compareIsoTimestamps(incomingEntry.updatedAt, existingEntry.updatedAt) >= 0
    ) {
      merged[dateKey] = incomingEntry;
    }
  }
  return merged;
}

function mergeProfiles(
  baseProfile: UserProfileData,
  incomingProfile: UserProfileData
): UserProfileData {
  const mergedWorkouts = mergeWorkouts(
    baseProfile.workouts,
    incomingProfile.workouts
  );
  const incomingIsNewer =
    compareIsoTimestamps(incomingProfile.updatedAt, baseProfile.updatedAt) >= 0;

  let latestUpdatedAt = incomingIsNewer
    ? incomingProfile.updatedAt
    : baseProfile.updatedAt;

  for (const entry of Object.values(mergedWorkouts)) {
    if (compareIsoTimestamps(entry.updatedAt, latestUpdatedAt) > 0) {
      latestUpdatedAt = entry.updatedAt;
    }
  }

  const earliestCreatedAt =
    compareIsoTimestamps(incomingProfile.createdAt, baseProfile.createdAt) <= 0
      ? incomingProfile.createdAt
      : baseProfile.createdAt;

  return {
    nickname: incomingIsNewer ? incomingProfile.nickname : baseProfile.nickname,
    createdAt: earliestCreatedAt,
    updatedAt: latestUpdatedAt,
    weeklyGoal: incomingIsNewer
      ? incomingProfile.weeklyGoal
      : baseProfile.weeklyGoal,
    workouts: mergedWorkouts,
  };
}

function readLocalStorageState(): LocalStoreState {
  if (typeof window === "undefined") {
    return { activeNickname: null, profiles: {} };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { activeNickname: null, profiles: {} };
    }
    const parsed = JSON.parse(raw) as Partial<LocalStoreState>;
    const nowIso = new Date().toISOString();
    const profiles: Record<string, UserProfileData> = {};

    if (parsed?.profiles && typeof parsed.profiles === "object") {
      for (const [, rawProfile] of Object.entries(parsed.profiles)) {
        const clean = sanitizeProfile(rawProfile, nowIso);
        if (clean) {
          const key = normalizeNicknameKey(clean.nickname);
          const existing = profiles[key];
          profiles[key] = existing ? mergeProfiles(existing, clean) : clean;
        }
      }
    }

    let activeNickname =
      typeof parsed?.activeNickname === "string" &&
      parsed.activeNickname.trim().length > 0
        ? parsed.activeNickname.trim()
        : null;

    if (activeNickname) {
      const activeKey = normalizeNicknameKey(activeNickname);
      if (!profiles[activeKey]) {
        profiles[activeKey] = {
          nickname: activeNickname,
          createdAt: nowIso,
          updatedAt: nowIso,
          weeklyGoal: 4,
          workouts: {},
        };
      } else {
        activeNickname = profiles[activeKey].nickname;
      }
    }

    return { activeNickname, profiles };
  } catch {
    return { activeNickname: null, profiles: {} };
  }
}

function writeLocalStorageState(state: LocalStoreState): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota / Safari private browsing errors
  }
}

function countCompletedWorkouts(workouts: Record<string, WorkoutEntry>): number {
  let count = 0;
  for (const entry of Object.values(workouts)) {
    if (entry?.completed) {
      count += 1;
    }
  }
  return count;
}

export function useWorkoutStore(): UseWorkoutStoreResult {
  const [hydrated, setHydrated] = useState(false);
  const [syncingCount, setSyncingCount] = useState(0);
  const [storeState, setStoreState] = useState<LocalStoreState>({
    activeNickname: null,
    profiles: {},
  });
  const [serverNicknames, setServerNicknames] = useState<SavedNicknameItem[]>(
    []
  );

  const storeRef = useRef<LocalStoreState>(storeState);

  const commitStore = useCallback((nextState: LocalStoreState) => {
    storeRef.current = nextState;
    writeLocalStorageState(nextState);
    setStoreState(nextState);
  }, []);

  const syncProfileWithApi = useCallback(
    async (profileToSync: UserProfileData): Promise<void> => {
      setSyncingCount((prev) => prev + 1);
      try {
        const res = await fetch("/api/workouts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "sync", profile: profileToSync }),
        });
        if (!res.ok) {
          return;
        }
        const data = (await res.json()) as WorkoutsApiResponse;
        if (Array.isArray(data.savedNicknames)) {
          setServerNicknames(data.savedNicknames);
        }
        if (data.profile) {
          const cleanServerProfile = sanitizeProfile(
            data.profile,
            new Date().toISOString()
          );
          if (cleanServerProfile) {
            const key = normalizeNicknameKey(cleanServerProfile.nickname);
            const currentStore = storeRef.current;
            const latestLocal = currentStore.profiles[key];
            const reconciled = latestLocal
              ? mergeProfiles(cleanServerProfile, latestLocal)
              : cleanServerProfile;

            const nextActive =
              currentStore.activeNickname &&
              normalizeNicknameKey(currentStore.activeNickname) === key
                ? reconciled.nickname
                : currentStore.activeNickname;

            commitStore({
              activeNickname: nextActive,
              profiles: {
                ...currentStore.profiles,
                [key]: reconciled,
              },
            });
          }
        }
      } catch {
        // Offline or network error: local state remains persisted in localStorage
      } finally {
        setSyncingCount((prev) => Math.max(0, prev - 1));
      }
    },
    [commitStore]
  );

  useEffect(() => {
    const initial = readLocalStorageState();
    storeRef.current = initial;
    setStoreState(initial);
    setHydrated(true);

    const activeKey = initial.activeNickname
      ? normalizeNicknameKey(initial.activeNickname)
      : null;
    const activeProfile = activeKey ? initial.profiles[activeKey] : null;

    if (activeProfile) {
      void syncProfileWithApi(activeProfile);
    } else {
      setSyncingCount((prev) => prev + 1);
      void fetch("/api/workouts", { cache: "no-store" })
        .then(async (res) => {
          if (!res.ok) {
            return;
          }
          const data = (await res.json()) as WorkoutsApiResponse;
          if (Array.isArray(data.savedNicknames)) {
            setServerNicknames(data.savedNicknames);
          }
        })
        .catch(() => {
          // Ignore offline error on initial directory fetch
        })
        .finally(() => {
          setSyncingCount((prev) => Math.max(0, prev - 1));
        });
    }
  }, [syncProfileWithApi]);

  const loginWithNickname = useCallback(
    async (nickname: string): Promise<void> => {
      const trimmed = nickname.trim();
      if (!trimmed) {
        return;
      }

      const key = normalizeNicknameKey(trimmed);
      const nowIso = new Date().toISOString();
      const currentStore = storeRef.current;
      const existingLocal = currentStore.profiles[key];
      const hadLocal = Boolean(existingLocal);

      const optimisticProfile: UserProfileData = existingLocal
        ? { ...existingLocal, nickname: trimmed }
        : {
            nickname: trimmed,
            createdAt: nowIso,
            updatedAt: nowIso,
            weeklyGoal: 4,
            workouts: {},
          };

      commitStore({
        activeNickname: optimisticProfile.nickname,
        profiles: {
          ...currentStore.profiles,
          [key]: optimisticProfile,
        },
      });

      if (hadLocal) {
        await syncProfileWithApi(optimisticProfile);
        return;
      }

      setSyncingCount((prev) => prev + 1);
      try {
        const getRes = await fetch(
          `/api/workouts?nickname=${encodeURIComponent(trimmed)}`,
          { cache: "no-store" }
        );
        if (getRes.ok) {
          const data = (await getRes.json()) as WorkoutsApiResponse;
          if (Array.isArray(data.savedNicknames)) {
            setServerNicknames(data.savedNicknames);
          }
          const serverProfile = data.profile
            ? sanitizeProfile(data.profile, nowIso)
            : null;

          if (serverProfile) {
            const latestStore = storeRef.current;
            const latestLocal = latestStore.profiles[key];
            const hasLocalWorkouts =
              latestLocal && Object.keys(latestLocal.workouts).length > 0;
            const mergedWorkouts = latestLocal
              ? mergeWorkouts(serverProfile.workouts, latestLocal.workouts)
              : serverProfile.workouts;

            const hydratedProfile: UserProfileData = {
              nickname: serverProfile.nickname,
              createdAt: serverProfile.createdAt,
              updatedAt: hasLocalWorkouts
                ? new Date().toISOString()
                : serverProfile.updatedAt,
              weeklyGoal: serverProfile.weeklyGoal,
              workouts: mergedWorkouts,
            };

            const nextActive =
              latestStore.activeNickname &&
              normalizeNicknameKey(latestStore.activeNickname) === key
                ? hydratedProfile.nickname
                : latestStore.activeNickname;

            commitStore({
              activeNickname: nextActive,
              profiles: {
                ...latestStore.profiles,
                [key]: hydratedProfile,
              },
            });

            if (hasLocalWorkouts) {
              await syncProfileWithApi(hydratedProfile);
            }
            return;
          }
        }
      } catch {
        // Ignore GET error and attempt sync fallback or stay offline
      } finally {
        setSyncingCount((prev) => Math.max(0, prev - 1));
      }

      const latestProfile = storeRef.current.profiles[key] ?? optimisticProfile;
      await syncProfileWithApi(latestProfile);
    },
    [commitStore, syncProfileWithApi]
  );

  const logoutNickname = useCallback((): void => {
    const currentStore = storeRef.current;
    commitStore({
      activeNickname: null,
      profiles: currentStore.profiles,
    });
  }, [commitStore]);

  const renameActiveNickname = useCallback(
    async (newNickname: string): Promise<boolean> => {
      const trimmed = newNickname.trim();
      const currentStore = storeRef.current;
      const oldActive = currentStore.activeNickname;
      if (!trimmed || !oldActive) {
        return false;
      }

      const oldKey = normalizeNicknameKey(oldActive);
      const newKey = normalizeNicknameKey(trimmed);
      const oldProfile = currentStore.profiles[oldKey];
      if (!oldProfile) {
        return false;
      }

      const nowIso = new Date().toISOString();
      const existingTarget = currentStore.profiles[newKey];
      const mergedWorkouts =
        oldKey === newKey
          ? oldProfile.workouts
          : mergeWorkouts(existingTarget?.workouts ?? {}, oldProfile.workouts);

      const renamedProfile: UserProfileData = {
        nickname: trimmed,
        createdAt: oldProfile.createdAt,
        updatedAt: nowIso,
        weeklyGoal: oldProfile.weeklyGoal,
        workouts: mergedWorkouts,
      };

      const nextProfiles = { ...currentStore.profiles };
      if (oldKey !== newKey) {
        delete nextProfiles[oldKey];
      }
      nextProfiles[newKey] = renamedProfile;

      commitStore({
        activeNickname: trimmed,
        profiles: nextProfiles,
      });

      if (oldKey !== newKey) {
        setServerNicknames((prev) =>
          prev.filter((item) => normalizeNicknameKey(item.nickname) !== oldKey)
        );
      }

      setSyncingCount((prev) => prev + 1);
      try {
        const res = await fetch("/api/workouts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "rename",
            oldNickname: oldActive,
            newNickname: trimmed,
          }),
        });
        if (res.ok) {
          const data = (await res.json()) as WorkoutsApiResponse;
          if (Array.isArray(data.savedNicknames)) {
            setServerNicknames(data.savedNicknames);
          }
          if (data.profile) {
            const cleanServer = sanitizeProfile(data.profile, nowIso);
            if (cleanServer) {
              const latestStore = storeRef.current;
              const latestLocal = latestStore.profiles[newKey];
              const reconciled = latestLocal
                ? mergeProfiles(cleanServer, latestLocal)
                : cleanServer;
              commitStore({
                activeNickname:
                  latestStore.activeNickname &&
                  normalizeNicknameKey(latestStore.activeNickname) === newKey
                    ? reconciled.nickname
                    : latestStore.activeNickname,
                profiles: {
                  ...latestStore.profiles,
                  [newKey]: reconciled,
                },
              });
            }
          }
        }
      } catch {
        // Offline fallback: rename already persisted in localStorage
      } finally {
        setSyncingCount((prev) => Math.max(0, prev - 1));
      }

      return true;
    },
    [commitStore]
  );

  const setWeeklyGoal = useCallback(
    async (goal: number): Promise<void> => {
      if (!Number.isFinite(goal)) {
        return;
      }
      const clampedGoal = Math.min(7, Math.max(1, Math.round(goal)));
      const currentStore = storeRef.current;
      if (!currentStore.activeNickname) {
        return;
      }

      const key = normalizeNicknameKey(currentStore.activeNickname);
      const currentProfile = currentStore.profiles[key];
      if (!currentProfile) {
        return;
      }

      const updatedProfile: UserProfileData = {
        ...currentProfile,
        weeklyGoal: clampedGoal,
        updatedAt: new Date().toISOString(),
      };

      commitStore({
        activeNickname: currentStore.activeNickname,
        profiles: {
          ...currentStore.profiles,
          [key]: updatedProfile,
        },
      });

      await syncProfileWithApi(updatedProfile);
    },
    [commitStore, syncProfileWithApi]
  );

  const toggleWorkoutDay = useCallback(
    async (dateKey: string): Promise<boolean> => {
      if (isFutureDateKey(dateKey)) {
        return false;
      }

      const currentStore = storeRef.current;
      if (!currentStore.activeNickname) {
        return false;
      }

      const key = normalizeNicknameKey(currentStore.activeNickname);
      const currentProfile = currentStore.profiles[key];
      if (!currentProfile) {
        return false;
      }

      const nowIso = new Date().toISOString();
      const existingEntry = currentProfile.workouts[dateKey];
      const nextEntry: WorkoutEntry = {
        ...existingEntry,
        date: dateKey,
        completed: !existingEntry?.completed,
        updatedAt: nowIso,
      };

      const updatedProfile: UserProfileData = {
        ...currentProfile,
        updatedAt: nowIso,
        workouts: {
          ...currentProfile.workouts,
          [dateKey]: nextEntry,
        },
      };

      commitStore({
        activeNickname: currentStore.activeNickname,
        profiles: {
          ...currentStore.profiles,
          [key]: updatedProfile,
        },
      });

      await syncProfileWithApi(updatedProfile);
      return true;
    },
    [commitStore, syncProfileWithApi]
  );

  const saveWorkoutDetail = useCallback(
    async (
      dateKey: string,
      detail: {
        completed: boolean;
        category?: WorkoutCategory;
        durationMinutes?: number;
        note?: string;
      }
    ): Promise<void> => {
      if (detail.completed && isFutureDateKey(dateKey)) {
        return;
      }

      const currentStore = storeRef.current;
      if (!currentStore.activeNickname) {
        return;
      }

      const key = normalizeNicknameKey(currentStore.activeNickname);
      const currentProfile = currentStore.profiles[key];
      if (!currentProfile) {
        return;
      }

      const nowIso = new Date().toISOString();
      const trimmedNote = detail.note?.trim();
      const nextEntry: WorkoutEntry = {
        date: dateKey,
        completed: Boolean(detail.completed),
        ...(detail.category && VALID_CATEGORIES.has(detail.category)
          ? { category: detail.category }
          : {}),
        ...(typeof detail.durationMinutes === "number" &&
        Number.isFinite(detail.durationMinutes) &&
        detail.durationMinutes > 0
          ? { durationMinutes: Math.round(detail.durationMinutes) }
          : {}),
        ...(trimmedNote ? { note: trimmedNote.slice(0, 120) } : {}),
        updatedAt: nowIso,
      };

      const updatedProfile: UserProfileData = {
        ...currentProfile,
        updatedAt: nowIso,
        workouts: {
          ...currentProfile.workouts,
          [dateKey]: nextEntry,
        },
      };

      commitStore({
        activeNickname: currentStore.activeNickname,
        profiles: {
          ...currentStore.profiles,
          [key]: updatedProfile,
        },
      });

      await syncProfileWithApi(updatedProfile);
    },
    [commitStore, syncProfileWithApi]
  );

  const exportBackupJson = useCallback((): string => {
    const currentStore = storeRef.current;
    const activeKey = currentStore.activeNickname
      ? normalizeNicknameKey(currentStore.activeNickname)
      : null;
    const activeProfile = activeKey
      ? (currentStore.profiles[activeKey] ?? null)
      : null;

    return JSON.stringify(
      {
        app: "betterme",
        version: 1,
        exportedAt: new Date().toISOString(),
        activeNickname: currentStore.activeNickname,
        profile: activeProfile,
        profiles: currentStore.profiles,
      },
      null,
      2
    );
  }, []);

  const importBackupJson = useCallback(
    async (rawJson: string): Promise<{ ok: boolean; message: string }> => {
      const trimmed = rawJson.trim();
      if (!trimmed) {
        return { ok: false, message: "붙여넣은 백업 데이터가 비어 있어요." };
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        return {
          ok: false,
          message: "올바른 JSON 형식이 아니에요. 백업 데이터를 다시 확인해 주세요.",
        };
      }

      if (!parsed || typeof parsed !== "object") {
        return { ok: false, message: "복원할 수 없는 데이터 형식이에요." };
      }

      const nowIso = new Date().toISOString();
      const record = parsed as Record<string, unknown>;
      const currentStore = storeRef.current;
      const nextProfiles: Record<string, UserProfileData> = {
        ...currentStore.profiles,
      };
      const importedKeys = new Set<string>();

      const applyRestoredProfile = (rawCandidate: unknown): string | null => {
        const clean = sanitizeProfile(
          rawCandidate as Partial<UserProfileData>,
          nowIso
        );
        if (!clean) {
          return null;
        }
        const key = normalizeNicknameKey(clean.nickname);
        const existing = nextProfiles[key];
        const stampedWorkouts: Record<string, WorkoutEntry> = {};
        for (const [dateKey, entry] of Object.entries(clean.workouts)) {
          stampedWorkouts[dateKey] = {
            ...entry,
            updatedAt: nowIso,
          };
        }

        nextProfiles[key] = {
          nickname: clean.nickname,
          createdAt: existing?.createdAt ?? clean.createdAt,
          updatedAt: nowIso,
          weeklyGoal: clean.weeklyGoal,
          workouts: {
            ...(existing?.workouts ?? {}),
            ...stampedWorkouts,
          },
        };
        importedKeys.add(key);
        return clean.nickname;
      };

      if (record.profiles && typeof record.profiles === "object") {
        for (const candidate of Object.values(
          record.profiles as Record<string, unknown>
        )) {
          applyRestoredProfile(candidate);
        }
      }

      let preferredNickname: string | null = null;
      if (record.profile && typeof record.profile === "object") {
        preferredNickname = applyRestoredProfile(record.profile);
      } else if (typeof record.nickname === "string") {
        preferredNickname = applyRestoredProfile(record);
      } else if (
        record.workouts &&
        typeof record.workouts === "object" &&
        currentStore.activeNickname
      ) {
        preferredNickname = applyRestoredProfile({
          nickname: currentStore.activeNickname,
          weeklyGoal:
            nextProfiles[normalizeNicknameKey(currentStore.activeNickname)]
              ?.weeklyGoal ?? 4,
          workouts: record.workouts,
        });
      }

      if (importedKeys.size === 0) {
        return {
          ok: false,
          message: "백업 데이터에서 유효한 운동 기록 프로필을 찾지 못했어요.",
        };
      }

      const backupActive =
        typeof record.activeNickname === "string" &&
        record.activeNickname.trim().length > 0
          ? record.activeNickname.trim()
          : null;

      let resolvedActive = currentStore.activeNickname;
      if (
        backupActive &&
        nextProfiles[normalizeNicknameKey(backupActive)]
      ) {
        resolvedActive =
          nextProfiles[normalizeNicknameKey(backupActive)].nickname;
      } else if (
        preferredNickname &&
        nextProfiles[normalizeNicknameKey(preferredNickname)]
      ) {
        resolvedActive =
          nextProfiles[normalizeNicknameKey(preferredNickname)].nickname;
      } else if (!resolvedActive) {
        const firstKey = Array.from(importedKeys)[0];
        resolvedActive = nextProfiles[firstKey]?.nickname ?? null;
      }

      commitStore({
        activeNickname: resolvedActive,
        profiles: nextProfiles,
      });

      for (const key of Array.from(importedKeys)) {
        const profileToSync = nextProfiles[key];
        if (profileToSync) {
          await syncProfileWithApi(profileToSync);
        }
      }

      return {
        ok: true,
        message: "백업 데이터를 성공적으로 복원했어요!",
      };
    },
    [commitStore, syncProfileWithApi]
  );

  const profile = useMemo<UserProfileData | null>(() => {
    if (!storeState.activeNickname) {
      return null;
    }
    const key = normalizeNicknameKey(storeState.activeNickname);
    return storeState.profiles[key] ?? null;
  }, [storeState]);

  const savedNicknames = useMemo<SavedNicknameItem[]>(() => {
    const mergedMap = new Map<string, SavedNicknameItem>();

    for (const item of serverNicknames) {
      if (!item?.nickname) {
        continue;
      }
      const key = normalizeNicknameKey(item.nickname);
      mergedMap.set(key, {
        nickname: item.nickname.trim(),
        totalCompleted: item.totalCompleted ?? 0,
        updatedAt: item.updatedAt ?? "",
      });
    }

    for (const [key, localProfile] of Object.entries(storeState.profiles)) {
      const localSummary: SavedNicknameItem = {
        nickname: localProfile.nickname,
        totalCompleted: countCompletedWorkouts(localProfile.workouts),
        updatedAt: localProfile.updatedAt,
      };
      const existing = mergedMap.get(key);
      if (
        !existing ||
        compareIsoTimestamps(localSummary.updatedAt, existing.updatedAt) >= 0
      ) {
        mergedMap.set(key, localSummary);
      }
    }

    return Array.from(mergedMap.values()).sort((a, b) =>
      compareIsoTimestamps(b.updatedAt, a.updatedAt)
    );
  }, [serverNicknames, storeState.profiles]);

  return {
    hydrated,
    syncing: syncingCount > 0,
    activeNickname: profile ? profile.nickname : storeState.activeNickname,
    profile,
    savedNicknames,
    loginWithNickname,
    logoutNickname,
    renameActiveNickname,
    setWeeklyGoal,
    toggleWorkoutDay,
    saveWorkoutDetail,
    exportBackupJson,
    importBackupJson,
  };
}
