"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isFutureDateKey } from "@/lib/date-utils";
import { matchWorkoutEmoji } from "@/lib/emoji-matcher";
import {
  DEFAULT_WORKOUT_CATEGORIES,
  getEntryCategoryIds,
  UserProfileData,
  WorkoutCategory,
  WorkoutCategoryMeta,
  WorkoutEntry,
} from "@/lib/workout-types";

export interface SaveWorkoutDetailInput {
  completed: boolean;
  categories?: WorkoutCategory[];
  category?: WorkoutCategory;
  durationMinutes?: number;
  note?: string;
}

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
  addWorkoutCategory: (
    label: string
  ) => Promise<{ ok: boolean; message?: string; category?: WorkoutCategoryMeta }>;
  removeWorkoutCategory: (categoryId: WorkoutCategory) => Promise<void>;
  moveWorkoutCategory: (
    categoryId: WorkoutCategory,
    direction: "up" | "down"
  ) => Promise<void>;
  resetWorkoutCategories: () => Promise<void>;
  toggleWorkoutDay: (dateKey: string) => Promise<boolean>;
  saveWorkoutDetail: (
    dateKey: string,
    detail: SaveWorkoutDetailInput
  ) => Promise<void>;
  exportBackupJson: () => string;
  importBackupJson: (
    rawJson: string
  ) => Promise<{ ok: boolean; message: string }>;
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

function cloneDefaultCategories(): WorkoutCategoryMeta[] {
  return DEFAULT_WORKOUT_CATEGORIES.map((item) => ({ ...item }));
}

function buildDefaultArchivedCategories(): Record<string, WorkoutCategoryMeta> {
  const map: Record<string, WorkoutCategoryMeta> = {};
  for (const item of DEFAULT_WORKOUT_CATEGORIES) {
    map[item.id] = { ...item };
  }
  return map;
}

function areDefaultCategories(categories: WorkoutCategoryMeta[]): boolean {
  if (categories.length !== DEFAULT_WORKOUT_CATEGORIES.length) {
    return false;
  }
  for (let i = 0; i < DEFAULT_WORKOUT_CATEGORIES.length; i += 1) {
    const a = categories[i];
    const b = DEFAULT_WORKOUT_CATEGORIES[i];
    if (a.id !== b.id || a.label !== b.label || a.emoji !== b.emoji) {
      return false;
    }
  }
  return true;
}

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

function sanitizeCategoryId(raw: unknown): WorkoutCategory | null {
  if (typeof raw !== "string") {
    return null;
  }
  const trimmed = raw.trim().slice(0, 64).trim();
  return trimmed.length > 0 ? trimmed : null;
}

function sanitizeCategoryMeta(
  raw: unknown,
  fallbackId?: string
): WorkoutCategoryMeta | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const candidate = raw as Partial<WorkoutCategoryMeta>;
  const id = sanitizeCategoryId(candidate.id ?? fallbackId);
  const label =
    typeof candidate.label === "string"
      ? candidate.label.trim().slice(0, 40).trim()
      : "";
  if (!id || !label) {
    return null;
  }
  const rawEmoji =
    typeof candidate.emoji === "string" ? candidate.emoji.trim() : "";
  const emoji = rawEmoji || matchWorkoutEmoji(label);
  return { id, label, emoji };
}

function sanitizeEntryCategories(
  rawCategories: unknown,
  rawCategory: unknown
): WorkoutCategory[] {
  if (Array.isArray(rawCategories)) {
    if (rawCategories.length === 0) {
      return [];
    }
    const seen = new Set<string>();
    const result: WorkoutCategory[] = [];
    for (const item of rawCategories) {
      const cleanId = sanitizeCategoryId(item);
      if (cleanId && !seen.has(cleanId)) {
        seen.add(cleanId);
        result.push(cleanId);
      }
    }
    if (result.length > 0) {
      return result;
    }
    const fallbackSingle = sanitizeCategoryId(rawCategory);
    return fallbackSingle ? [fallbackSingle] : [];
  }

  const single = sanitizeCategoryId(rawCategory);
  return single ? [single] : [];
}

function sanitizeArchivedCategories(
  rawArchived: unknown,
  activeCategories: WorkoutCategoryMeta[]
): Record<string, WorkoutCategoryMeta> {
  const archived: Record<string, WorkoutCategoryMeta> = {};

  if (
    rawArchived &&
    typeof rawArchived === "object" &&
    !Array.isArray(rawArchived)
  ) {
    for (const [key, value] of Object.entries(
      rawArchived as Record<string, unknown>
    )) {
      const cleanMeta = sanitizeCategoryMeta(value, key);
      if (cleanMeta) {
        archived[cleanMeta.id] = cleanMeta;
      }
    }
  }

  for (const cat of activeCategories) {
    archived[cat.id] = { ...cat };
  }

  return archived;
}

function hashStringForId(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function createCustomCategoryId(
  label: string,
  existingIds: Set<string>
): WorkoutCategory {
  const asciiSlug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 20);
  const base = asciiSlug
    ? `cat-${asciiSlug}`
    : `cat-${hashStringForId(label.toLowerCase())}`;

  if (!existingIds.has(base)) {
    return base;
  }

  let suffix = 2;
  while (existingIds.has(`${base}-${suffix}`)) {
    suffix += 1;
  }
  return `${base}-${suffix}`.slice(0, 64);
}

export function sanitizeWorkoutEntry(
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

  const categories = sanitizeEntryCategories(raw.categories, raw.category);

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
    ...(categories.length > 0
      ? { categories, category: categories[0] }
      : {}),
    ...(durationMinutes !== undefined ? { durationMinutes } : {}),
    ...(note ? { note } : {}),
    updatedAt,
  };
}

export function sanitizeProfile(
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

  const hasCategoriesArray = Array.isArray(raw.categories);
  let categories: WorkoutCategoryMeta[];
  if (hasCategoriesArray) {
    const seenIds = new Set<string>();
    categories = [];
    for (const rawItem of raw.categories as unknown[]) {
      const cleanMeta = sanitizeCategoryMeta(rawItem);
      if (cleanMeta && !seenIds.has(cleanMeta.id)) {
        seenIds.add(cleanMeta.id);
        categories.push(cleanMeta);
      }
    }
  } else {
    categories = cloneDefaultCategories();
  }

  const archivedCategories = sanitizeArchivedCategories(
    raw.archivedCategories,
    categories
  );

  const explicitCategoriesUpdatedAt =
    typeof raw.categoriesUpdatedAt === "string" &&
    raw.categoriesUpdatedAt.trim().length > 0
      ? raw.categoriesUpdatedAt.trim()
      : undefined;

  const categoriesUpdatedAt =
    explicitCategoriesUpdatedAt ??
    (hasCategoriesArray && !areDefaultCategories(categories)
      ? updatedAt
      : undefined);

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
    categories,
    archivedCategories,
    ...(categoriesUpdatedAt ? { categoriesUpdatedAt } : {}),
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

function mergeCategoryState(
  baseProfile: Pick<
    UserProfileData,
    "categories" | "archivedCategories" | "categoriesUpdatedAt"
  >,
  incomingProfile: Pick<
    UserProfileData,
    "categories" | "archivedCategories" | "categoriesUpdatedAt"
  >,
  incomingIsNewer: boolean
): {
  categories: WorkoutCategoryMeta[];
  archivedCategories: Record<string, WorkoutCategoryMeta>;
  categoriesUpdatedAt?: string;
} {
  const baseCatTs = baseProfile.categoriesUpdatedAt;
  const incomingCatTs = incomingProfile.categoriesUpdatedAt;

  let pickIncomingCategories: boolean;
  let categoriesUpdatedAt: string | undefined;

  if (baseCatTs && incomingCatTs) {
    pickIncomingCategories = compareIsoTimestamps(incomingCatTs, baseCatTs) >= 0;
    categoriesUpdatedAt = pickIncomingCategories ? incomingCatTs : baseCatTs;
  } else if (incomingCatTs && !baseCatTs) {
    pickIncomingCategories = true;
    categoriesUpdatedAt = incomingCatTs;
  } else if (baseCatTs && !incomingCatTs) {
    pickIncomingCategories = false;
    categoriesUpdatedAt = baseCatTs;
  } else {
    pickIncomingCategories = incomingIsNewer;
    categoriesUpdatedAt = undefined;
  }

  const winningCategories = (
    pickIncomingCategories ? incomingProfile.categories : baseProfile.categories
  ).map((item) => ({ ...item }));

  const archivedCategories: Record<string, WorkoutCategoryMeta> = {};
  const olderArchived = pickIncomingCategories
    ? baseProfile.archivedCategories
    : incomingProfile.archivedCategories;
  const newerArchived = pickIncomingCategories
    ? incomingProfile.archivedCategories
    : baseProfile.archivedCategories;

  for (const [id, meta] of Object.entries(olderArchived ?? {})) {
    archivedCategories[id] = { ...meta };
  }
  for (const [id, meta] of Object.entries(newerArchived ?? {})) {
    archivedCategories[id] = { ...meta };
  }
  for (const meta of baseProfile.categories) {
    archivedCategories[meta.id] = { ...meta };
  }
  for (const meta of incomingProfile.categories) {
    archivedCategories[meta.id] = { ...meta };
  }
  for (const meta of winningCategories) {
    archivedCategories[meta.id] = { ...meta };
  }

  return {
    categories: winningCategories,
    archivedCategories,
    ...(categoriesUpdatedAt ? { categoriesUpdatedAt } : {}),
  };
}

export function mergeProfiles(
  baseProfile: UserProfileData,
  incomingProfile: UserProfileData
): UserProfileData {
  const mergedWorkouts = mergeWorkouts(
    baseProfile.workouts,
    incomingProfile.workouts
  );
  const incomingIsNewer =
    compareIsoTimestamps(incomingProfile.updatedAt, baseProfile.updatedAt) >= 0;

  const mergedCategoryState = mergeCategoryState(
    baseProfile,
    incomingProfile,
    incomingIsNewer
  );

  let latestUpdatedAt = incomingIsNewer
    ? incomingProfile.updatedAt
    : baseProfile.updatedAt;

  if (
    mergedCategoryState.categoriesUpdatedAt &&
    compareIsoTimestamps(
      mergedCategoryState.categoriesUpdatedAt,
      latestUpdatedAt
    ) > 0
  ) {
    latestUpdatedAt = mergedCategoryState.categoriesUpdatedAt;
  }

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
    ...mergedCategoryState,
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
          categories: cloneDefaultCategories(),
          archivedCategories: buildDefaultArchivedCategories(),
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

function countCompletedWorkouts(
  workouts: Record<string, WorkoutEntry>
): number {
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
            categories: cloneDefaultCategories(),
            archivedCategories: buildDefaultArchivedCategories(),
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
            const hasLocalWorkouts = Boolean(
              latestLocal && Object.keys(latestLocal.workouts).length > 0
            );
            const hasLocalCategoryEdits = Boolean(
              latestLocal?.categoriesUpdatedAt
            );
            const mergedWorkouts = latestLocal
              ? mergeWorkouts(serverProfile.workouts, latestLocal.workouts)
              : serverProfile.workouts;
            const mergedCategoryState = latestLocal
              ? mergeCategoryState(serverProfile, latestLocal, false)
              : {
                  categories: serverProfile.categories.map((item) => ({
                    ...item,
                  })),
                  archivedCategories: sanitizeArchivedCategories(
                    serverProfile.archivedCategories,
                    serverProfile.categories
                  ),
                  ...(serverProfile.categoriesUpdatedAt
                    ? { categoriesUpdatedAt: serverProfile.categoriesUpdatedAt }
                    : {}),
                };

            const hydratedProfile: UserProfileData = {
              nickname: serverProfile.nickname,
              createdAt: serverProfile.createdAt,
              updatedAt:
                hasLocalWorkouts || hasLocalCategoryEdits
                  ? new Date().toISOString()
                  : serverProfile.updatedAt,
              weeklyGoal: serverProfile.weeklyGoal,
              ...mergedCategoryState,
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

            if (hasLocalWorkouts || hasLocalCategoryEdits) {
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

      const mergedCategoryState =
        oldKey === newKey || !existingTarget
          ? {
              categories: oldProfile.categories.map((item) => ({ ...item })),
              archivedCategories: sanitizeArchivedCategories(
                oldProfile.archivedCategories,
                oldProfile.categories
              ),
              ...(oldProfile.categoriesUpdatedAt
                ? { categoriesUpdatedAt: oldProfile.categoriesUpdatedAt }
                : {}),
            }
          : mergeCategoryState(existingTarget, oldProfile, true);

      const renamedProfile: UserProfileData = {
        nickname: trimmed,
        createdAt:
          oldKey === newKey || !existingTarget
            ? oldProfile.createdAt
            : compareIsoTimestamps(
                  oldProfile.createdAt,
                  existingTarget.createdAt
                ) <= 0
              ? oldProfile.createdAt
              : existingTarget.createdAt,
        updatedAt: nowIso,
        weeklyGoal: oldProfile.weeklyGoal,
        ...mergedCategoryState,
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

  const addWorkoutCategory = useCallback(
    async (
      label: string
    ): Promise<{
      ok: boolean;
      message?: string;
      category?: WorkoutCategoryMeta;
    }> => {
      const trimmed =
        typeof label === "string" ? label.trim().slice(0, 24).trim() : "";
      if (!trimmed) {
        return { ok: false, message: "운동 이름을 입력해 주세요." };
      }

      const currentStore = storeRef.current;
      if (!currentStore.activeNickname) {
        return { ok: false, message: "로그인이 필요해요." };
      }

      const key = normalizeNicknameKey(currentStore.activeNickname);
      const currentProfile = currentStore.profiles[key];
      if (!currentProfile) {
        return { ok: false, message: "로그인이 필요해요." };
      }

      const lowerLabel = trimmed.toLowerCase();
      const duplicateActive = currentProfile.categories.some(
        (item) => item.label.trim().toLowerCase() === lowerLabel
      );
      if (duplicateActive) {
        return { ok: false, message: "이미 등록된 운동 종류예요." };
      }

      const activeIds = new Set(
        currentProfile.categories.map((item) => item.id)
      );

      const defaultMatch = DEFAULT_WORKOUT_CATEGORIES.find(
        (item) =>
          item.label.trim().toLowerCase() === lowerLabel &&
          !activeIds.has(item.id)
      );

      const archivedMatch = !defaultMatch
        ? Object.values(currentProfile.archivedCategories ?? {}).find(
            (item) =>
              item.label.trim().toLowerCase() === lowerLabel &&
              !activeIds.has(item.id)
          )
        : undefined;

      let newCategory: WorkoutCategoryMeta;
      if (defaultMatch) {
        newCategory = {
          id: defaultMatch.id,
          label: trimmed,
          emoji: defaultMatch.emoji,
        };
      } else if (archivedMatch) {
        newCategory = {
          id: archivedMatch.id,
          label: trimmed,
          emoji:
            archivedMatch.emoji ||
            matchWorkoutEmoji(trimmed, currentProfile.categories),
        };
      } else {
        const allKnownIds = new Set<string>(activeIds);
        for (const id of Object.keys(currentProfile.archivedCategories ?? {})) {
          allKnownIds.add(id);
        }
        for (const def of DEFAULT_WORKOUT_CATEGORIES) {
          allKnownIds.add(def.id);
        }
        const id = createCustomCategoryId(trimmed, allKnownIds);
        const emoji = matchWorkoutEmoji(trimmed, currentProfile.categories);
        newCategory = { id, label: trimmed, emoji };
      }

      const nowIso = new Date().toISOString();
      const nextCategories = [...currentProfile.categories, newCategory];
      const nextArchived: Record<string, WorkoutCategoryMeta> = {
        ...(currentProfile.archivedCategories ?? {}),
      };
      for (const cat of currentProfile.categories) {
        nextArchived[cat.id] = { ...cat };
      }
      nextArchived[newCategory.id] = { ...newCategory };

      const updatedProfile: UserProfileData = {
        ...currentProfile,
        categories: nextCategories,
        archivedCategories: nextArchived,
        categoriesUpdatedAt: nowIso,
        updatedAt: nowIso,
      };

      commitStore({
        activeNickname: currentStore.activeNickname,
        profiles: {
          ...currentStore.profiles,
          [key]: updatedProfile,
        },
      });

      await syncProfileWithApi(updatedProfile);
      return { ok: true, category: newCategory };
    },
    [commitStore, syncProfileWithApi]
  );

  const removeWorkoutCategory = useCallback(
    async (categoryId: WorkoutCategory): Promise<void> => {
      const cleanId = sanitizeCategoryId(categoryId);
      if (!cleanId) {
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

      const exists = currentProfile.categories.some(
        (item) => item.id === cleanId
      );
      if (!exists) {
        return;
      }

      const nowIso = new Date().toISOString();
      const nextArchived: Record<string, WorkoutCategoryMeta> = {
        ...(currentProfile.archivedCategories ?? {}),
      };
      for (const cat of currentProfile.categories) {
        nextArchived[cat.id] = { ...cat };
      }

      const nextCategories = currentProfile.categories.filter(
        (item) => item.id !== cleanId
      );

      const updatedProfile: UserProfileData = {
        ...currentProfile,
        categories: nextCategories,
        archivedCategories: nextArchived,
        categoriesUpdatedAt: nowIso,
        updatedAt: nowIso,
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

  const moveWorkoutCategory = useCallback(
    async (
      categoryId: WorkoutCategory,
      direction: "up" | "down"
    ): Promise<void> => {
      const cleanId = sanitizeCategoryId(categoryId);
      if (!cleanId) {
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

      const index = currentProfile.categories.findIndex(
        (item) => item.id === cleanId
      );
      if (index === -1) {
        return;
      }

      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= currentProfile.categories.length) {
        return;
      }

      const nowIso = new Date().toISOString();
      const nextCategories = currentProfile.categories.map((item) => ({
        ...item,
      }));
      const [moved] = nextCategories.splice(index, 1);
      nextCategories.splice(targetIndex, 0, moved);

      const nextArchived: Record<string, WorkoutCategoryMeta> = {
        ...(currentProfile.archivedCategories ?? {}),
      };
      for (const cat of nextCategories) {
        nextArchived[cat.id] = { ...cat };
      }

      const updatedProfile: UserProfileData = {
        ...currentProfile,
        categories: nextCategories,
        archivedCategories: nextArchived,
        categoriesUpdatedAt: nowIso,
        updatedAt: nowIso,
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

  const resetWorkoutCategories = useCallback(async (): Promise<void> => {
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
    const nextCategories = cloneDefaultCategories();
    const nextArchived: Record<string, WorkoutCategoryMeta> = {
      ...(currentProfile.archivedCategories ?? {}),
    };
    for (const cat of currentProfile.categories) {
      nextArchived[cat.id] = { ...cat };
    }
    for (const cat of nextCategories) {
      nextArchived[cat.id] = { ...cat };
    }

    const updatedProfile: UserProfileData = {
      ...currentProfile,
      categories: nextCategories,
      archivedCategories: nextArchived,
      categoriesUpdatedAt: nowIso,
      updatedAt: nowIso,
    };

    commitStore({
      activeNickname: currentStore.activeNickname,
      profiles: {
        ...currentStore.profiles,
        [key]: updatedProfile,
      },
    });

    await syncProfileWithApi(updatedProfile);
  }, [commitStore, syncProfileWithApi]);

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
      const existingCategoryIds = getEntryCategoryIds(existingEntry);
      const nextEntry: WorkoutEntry = {
        ...(existingEntry?.durationMinutes !== undefined
          ? { durationMinutes: existingEntry.durationMinutes }
          : {}),
        ...(existingEntry?.note ? { note: existingEntry.note } : {}),
        ...(existingCategoryIds.length > 0
          ? {
              categories: existingCategoryIds,
              category: existingCategoryIds[0],
            }
          : {}),
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
    async (dateKey: string, detail: SaveWorkoutDetailInput): Promise<void> => {
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
      const categories = sanitizeEntryCategories(
        detail.categories,
        detail.category
      );
      const trimmedNote = detail.note?.trim();
      const nextEntry: WorkoutEntry = {
        date: dateKey,
        completed: Boolean(detail.completed),
        ...(categories.length > 0
          ? { categories, category: categories[0] }
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

        const mergedCategoryState = existing
          ? mergeCategoryState(existing, clean, true)
          : {
              categories: clean.categories,
              archivedCategories:
                clean.archivedCategories ??
                sanitizeArchivedCategories(undefined, clean.categories),
              ...(clean.categoriesUpdatedAt
                ? { categoriesUpdatedAt: clean.categoriesUpdatedAt }
                : {}),
            };

        nextProfiles[key] = {
          nickname: clean.nickname,
          createdAt: existing?.createdAt ?? clean.createdAt,
          updatedAt: nowIso,
          weeklyGoal: clean.weeklyGoal,
          ...mergedCategoryState,
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
    addWorkoutCategory,
    removeWorkoutCategory,
    moveWorkoutCategory,
    resetWorkoutCategories,
    toggleWorkoutDay,
    saveWorkoutDetail,
    exportBackupJson,
    importBackupJson,
  };
}
