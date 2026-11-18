"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  calculateStreaks,
  getMonthCompletedCount,
  getTodayKey,
  isFutureDateKey,
} from "@/lib/date-utils";
import { matchWorkoutEmoji } from "@/lib/emoji-matcher";
import {
  DEFAULT_WORKOUT_CATEGORIES,
  getEntryCategoryIds,
  LeaderboardEntry,
  NicknameRenameRecord,
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
  leaderboard: LeaderboardEntry[];
  refreshLeaderboard: () => Promise<void>;
  syncNow: () => Promise<void>;
  loginWithNickname: (nickname: string) => Promise<void>;
  logoutNickname: () => void;
  renameActiveNickname: (newNickname: string) => Promise<boolean>;
  deleteSavedNickname: (nickname: string) => Promise<boolean>;
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
  renames?: Record<string, NicknameRenameRecord>;
  deletedNicknames?: Record<string, string>;
}

interface WorkoutsApiResponse {
  ok?: boolean;
  profile?: UserProfileData | null;
  deleted?: boolean;
  redirectedFrom?: string;
  savedNicknames?: SavedNicknameItem[];
  leaderboard?: LeaderboardEntry[];
  renames?: Record<string, NicknameRenameRecord>;
  deletedNicknames?: Record<string, string>;
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

function parseDateKeyYearMonth(dateKey: string): {
  year: number;
  monthIndex0: number;
} {
  const [y, m] = dateKey.split("-").map((part) => parseInt(part, 10));
  const fallback = new Date();
  return {
    year: Number.isFinite(y) ? y : fallback.getFullYear(),
    monthIndex0:
      Number.isFinite(m) && m >= 1 && m <= 12 ? m - 1 : fallback.getMonth(),
  };
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

function sanitizeRenamesMap(
  rawRenames: unknown
): Record<string, NicknameRenameRecord> {
  const sanitized: Record<string, NicknameRenameRecord> = {};
  if (!rawRenames || typeof rawRenames !== "object" || Array.isArray(rawRenames)) {
    return sanitized;
  }

  for (const [rawKey, rawValue] of Object.entries(
    rawRenames as Record<string, unknown>
  )) {
    const oldKey = normalizeNicknameKey(rawKey);
    if (!oldKey || !rawValue || typeof rawValue !== "object") {
      continue;
    }
    const candidate = rawValue as Partial<NicknameRenameRecord>;
    const targetNickname =
      typeof candidate.targetNickname === "string"
        ? candidate.targetNickname.trim()
        : "";
    const renamedAt =
      typeof candidate.renamedAt === "string"
        ? candidate.renamedAt.trim()
        : "";
    if (!targetNickname || !renamedAt) {
      continue;
    }
    if (normalizeNicknameKey(targetNickname) === oldKey) {
      continue;
    }
    const existing = sanitized[oldKey];
    if (
      !existing ||
      compareIsoTimestamps(renamedAt, existing.renamedAt) >= 0
    ) {
      sanitized[oldKey] = { targetNickname, renamedAt };
    }
  }

  return sanitized;
}

function sanitizeDeletedNicknamesMap(rawDeleted: unknown): Record<string, string> {
  const sanitized: Record<string, string> = {};
  if (
    !rawDeleted ||
    typeof rawDeleted !== "object" ||
    Array.isArray(rawDeleted)
  ) {
    return sanitized;
  }

  for (const [rawKey, rawValue] of Object.entries(
    rawDeleted as Record<string, unknown>
  )) {
    const key = normalizeNicknameKey(rawKey);
    const deletedAt = typeof rawValue === "string" ? rawValue.trim() : "";
    if (!key || !deletedAt) {
      continue;
    }
    const existing = sanitized[key];
    if (!existing || compareIsoTimestamps(deletedAt, existing) >= 0) {
      sanitized[key] = deletedAt;
    }
  }

  return sanitized;
}

function resolveRenameChain(
  startKey: string,
  renames?: Record<string, NicknameRenameRecord>
): { targetKey: string; targetNickname: string; renamedAt: string } | null {
  if (!renames || !startKey) {
    return null;
  }

  const visited = new Set<string>([startKey]);
  let currentKey = startKey;
  let finalRecord: NicknameRenameRecord | null = null;
  let latestRenamedAt = "";

  for (let hop = 0; hop < 10; hop += 1) {
    const rec = renames[currentKey];
    if (!rec) {
      break;
    }
    const nextKey = normalizeNicknameKey(rec.targetNickname);
    if (!nextKey || visited.has(nextKey)) {
      break;
    }
    visited.add(nextKey);
    finalRecord = rec;
    if (
      !latestRenamedAt ||
      compareIsoTimestamps(rec.renamedAt, latestRenamedAt) > 0
    ) {
      latestRenamedAt = rec.renamedAt;
    }
    currentKey = nextKey;
  }

  if (!finalRecord || currentKey === startKey) {
    return null;
  }

  return {
    targetKey: currentKey,
    targetNickname: finalRecord.targetNickname,
    renamedAt: latestRenamedAt || finalRecord.renamedAt,
  };
}

function mergeRenamesMap(
  baseRenames?: Record<string, NicknameRenameRecord>,
  incomingRenames?: Record<string, NicknameRenameRecord>
): Record<string, NicknameRenameRecord> {
  const merged: Record<string, NicknameRenameRecord> = {};
  for (const source of [baseRenames, incomingRenames]) {
    if (!source) continue;
    for (const [key, rec] of Object.entries(source)) {
      const existing = merged[key];
      if (
        !existing ||
        compareIsoTimestamps(rec.renamedAt, existing.renamedAt) >= 0
      ) {
        merged[key] = { ...rec };
      }
    }
  }
  return merged;
}

function mergeDeletedMap(
  baseDeleted?: Record<string, string>,
  incomingDeleted?: Record<string, string>
): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const source of [baseDeleted, incomingDeleted]) {
    if (!source) continue;
    for (const [key, deletedAt] of Object.entries(source)) {
      const existing = merged[key];
      if (!existing || compareIsoTimestamps(deletedAt, existing) >= 0) {
        merged[key] = deletedAt;
      }
    }
  }
  return merged;
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

function reconcileLocalTombstones(
  state: LocalStoreState,
  incomingRenames?: Record<string, NicknameRenameRecord>,
  incomingDeleted?: Record<string, string>
): LocalStoreState {
  const profiles: Record<string, UserProfileData> = { ...state.profiles };
  const renames = mergeRenamesMap(state.renames, incomingRenames);
  const deletedNicknames = mergeDeletedMap(
    state.deletedNicknames,
    incomingDeleted
  );
  let activeNickname = state.activeNickname;

  for (const [key, deletedAt] of Object.entries(deletedNicknames)) {
    const rec = renames[key];
    if (rec && compareIsoTimestamps(deletedAt, rec.renamedAt) >= 0) {
      delete renames[key];
    } else if (rec && compareIsoTimestamps(rec.renamedAt, deletedAt) > 0) {
      delete deletedNicknames[key];
    }
  }

  for (const key of Object.keys(profiles)) {
    const profile = profiles[key];
    const deletedAt = deletedNicknames[key];
    if (!deletedAt) continue;

    if (compareIsoTimestamps(profile.createdAt, deletedAt) <= 0) {
      delete profiles[key];
      if (activeNickname && normalizeNicknameKey(activeNickname) === key) {
        activeNickname = null;
      }
    } else {
      delete deletedNicknames[key];
    }
  }

  for (const key of Object.keys(profiles)) {
    const profile = profiles[key];
    if (!profile) continue;

    const chain = resolveRenameChain(key, renames);
    if (!chain) continue;

    if (compareIsoTimestamps(profile.createdAt, chain.renamedAt) > 0) {
      delete renames[key];
      continue;
    }

    const targetDeletedAt = deletedNicknames[chain.targetKey];
    if (
      targetDeletedAt &&
      compareIsoTimestamps(profile.createdAt, targetDeletedAt) <= 0
    ) {
      delete profiles[key];
      if (activeNickname && normalizeNicknameKey(activeNickname) === key) {
        activeNickname = null;
      }
      continue;
    }

    const existingTarget = profiles[chain.targetKey];
    if (existingTarget) {
      const merged = mergeProfiles(existingTarget, profile);
      profiles[chain.targetKey] = {
        ...merged,
        nickname: existingTarget.nickname,
      };
    } else {
      profiles[chain.targetKey] = {
        ...profile,
        nickname: chain.targetNickname,
      };
    }
    delete profiles[key];

    if (activeNickname && normalizeNicknameKey(activeNickname) === key) {
      activeNickname = profiles[chain.targetKey].nickname;
    }
  }

  if (activeNickname) {
    const activeKey = normalizeNicknameKey(activeNickname);
    if (!profiles[activeKey]) {
      const chain = resolveRenameChain(activeKey, renames);
      if (chain && profiles[chain.targetKey]) {
        activeNickname = profiles[chain.targetKey].nickname;
      } else if (deletedNicknames[activeKey]) {
        activeNickname = null;
      }
    }
  }

  return {
    activeNickname,
    profiles,
    renames,
    deletedNicknames,
  };
}

function readLocalStorageState(): LocalStoreState {
  if (typeof window === "undefined") {
    return {
      activeNickname: null,
      profiles: {},
      renames: {},
      deletedNicknames: {},
    };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        activeNickname: null,
        profiles: {},
        renames: {},
        deletedNicknames: {},
      };
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

    const renames = sanitizeRenamesMap(parsed?.renames);
    const deletedNicknames = sanitizeDeletedNicknamesMap(
      parsed?.deletedNicknames
    );

    let activeNickname =
      typeof parsed?.activeNickname === "string" &&
      parsed.activeNickname.trim().length > 0
        ? parsed.activeNickname.trim()
        : null;

    if (activeNickname) {
      const activeKey = normalizeNicknameKey(activeNickname);
      if (!profiles[activeKey]) {
        const chain = resolveRenameChain(activeKey, renames);
        if (chain && profiles[chain.targetKey]) {
          activeNickname = profiles[chain.targetKey].nickname;
        } else if (deletedNicknames[activeKey]) {
          activeNickname = null;
        } else {
          profiles[activeKey] = {
            nickname: activeNickname,
            createdAt: nowIso,
            updatedAt: nowIso,
            weeklyGoal: 4,
            categories: cloneDefaultCategories(),
            archivedCategories: buildDefaultArchivedCategories(),
            workouts: {},
          };
        }
      } else {
        activeNickname = profiles[activeKey].nickname;
      }
    }

    return reconcileLocalTombstones({
      activeNickname,
      profiles,
      renames,
      deletedNicknames,
    });
  } catch {
    return {
      activeNickname: null,
      profiles: {},
      renames: {},
      deletedNicknames: {},
    };
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

function buildLocalLeaderboardEntry(
  profile: UserProfileData,
  todayKey: string
): LeaderboardEntry {
  const { year, monthIndex0 } = parseDateKeyYearMonth(todayKey);
  const { currentStreak, bestStreak, totalCompleted } = calculateStreaks(
    profile.workouts,
    todayKey
  );
  const monthCompleted = getMonthCompletedCount(
    profile.workouts,
    year,
    monthIndex0
  );

  let totalMinutes = 0;
  for (const entry of Object.values(profile.workouts)) {
    if (
      entry?.completed &&
      typeof entry.durationMinutes === "number" &&
      Number.isFinite(entry.durationMinutes) &&
      entry.durationMinutes > 0
    ) {
      totalMinutes += Math.round(entry.durationMinutes);
    }
  }

  return {
    nickname: profile.nickname,
    monthCompleted,
    currentStreak,
    bestStreak,
    totalCompleted,
    totalMinutes,
    weeklyGoal: profile.weeklyGoal,
    todayCompleted: Boolean(profile.workouts[todayKey]?.completed),
    updatedAt: profile.updatedAt,
  };
}

function isKeyTombstoned(
  key: string,
  state: Pick<LocalStoreState, "profiles" | "renames" | "deletedNicknames">
): boolean {
  if (state.profiles[key]) {
    return false;
  }
  return Boolean(state.renames?.[key] || state.deletedNicknames?.[key]);
}

export function useWorkoutStore(): UseWorkoutStoreResult {
  const [hydrated, setHydrated] = useState(false);
  const [syncingCount, setSyncingCount] = useState(0);
  const [storeState, setStoreState] = useState<LocalStoreState>({
    activeNickname: null,
    profiles: {},
    renames: {},
    deletedNicknames: {},
  });
  const [serverNicknames, setServerNicknames] = useState<SavedNicknameItem[]>(
    []
  );
  const [serverLeaderboard, setServerLeaderboard] = useState<
    LeaderboardEntry[]
  >([]);
  const [todayKeyState, setTodayKeyState] = useState<string>(() =>
    getTodayKey()
  );

  const storeRef = useRef<LocalStoreState>(storeState);
  const lastForegroundSyncRef = useRef<number>(0);

  const commitStore = useCallback((nextState: LocalStoreState) => {
    const cleanState: LocalStoreState = {
      activeNickname: nextState.activeNickname,
      profiles: nextState.profiles,
      renames: nextState.renames ?? storeRef.current.renames ?? {},
      deletedNicknames:
        nextState.deletedNicknames ?? storeRef.current.deletedNicknames ?? {},
    };
    storeRef.current = cleanState;
    writeLocalStorageState(cleanState);
    setStoreState(cleanState);
  }, []);

  const applyServerDirectory = useCallback(
    (data: WorkoutsApiResponse, stateSnapshot: LocalStoreState) => {
      if (Array.isArray(data.savedNicknames)) {
        setServerNicknames(
          data.savedNicknames.filter((item) => {
            if (!item?.nickname) return false;
            const k = normalizeNicknameKey(item.nickname);
            return !isKeyTombstoned(k, stateSnapshot);
          })
        );
      }
      if (Array.isArray(data.leaderboard)) {
        setServerLeaderboard(
          data.leaderboard.filter((item) => {
            if (!item?.nickname) return false;
            const k = normalizeNicknameKey(item.nickname);
            return !isKeyTombstoned(k, stateSnapshot);
          })
        );
      }
    },
    []
  );

  const syncProfileWithApi = useCallback(
    async (
      profileToSync: UserProfileData,
      options?: { allowCreateNew?: boolean }
    ): Promise<void> => {
      setSyncingCount((prev) => prev + 1);
      try {
        const res = await fetch("/api/workouts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "sync",
            profile: profileToSync,
            todayKey: getTodayKey(),
            ...(options?.allowCreateNew ? { allowCreateNew: true } : {}),
          }),
        });
        if (!res.ok) {
          return;
        }
        const data = (await res.json()) as WorkoutsApiResponse;
        const incomingRenames = sanitizeRenamesMap(data.renames);
        const incomingDeleted = sanitizeDeletedNicknamesMap(
          data.deletedNicknames
        );

        let nextState = reconcileLocalTombstones(
          storeRef.current,
          incomingRenames,
          incomingDeleted
        );

        const sentKey = normalizeNicknameKey(profileToSync.nickname);

        if (data.deleted) {
          const nextProfiles = { ...nextState.profiles };
          delete nextProfiles[sentKey];
          const nextDeleted = {
            ...(nextState.deletedNicknames ?? {}),
            [sentKey]:
              nextState.deletedNicknames?.[sentKey] ?? new Date().toISOString(),
          };
          const nextActive =
            nextState.activeNickname &&
            normalizeNicknameKey(nextState.activeNickname) === sentKey
              ? null
              : nextState.activeNickname;
          nextState = {
            ...nextState,
            activeNickname: nextActive,
            profiles: nextProfiles,
            deletedNicknames: nextDeleted,
          };
          commitStore(nextState);
          applyServerDirectory(data, nextState);
          return;
        }

        if (data.profile) {
          const cleanServerProfile = sanitizeProfile(
            data.profile,
            new Date().toISOString()
          );
          if (cleanServerProfile) {
            const deletedAtForSent = nextState.deletedNicknames?.[sentKey];
            const chainForSent = resolveRenameChain(sentKey, nextState.renames);

            if (
              deletedAtForSent &&
              compareIsoTimestamps(profileToSync.createdAt, deletedAtForSent) <=
                0
            ) {
              const nextProfiles = { ...nextState.profiles };
              delete nextProfiles[sentKey];
              nextState = { ...nextState, profiles: nextProfiles };
            } else if (
              chainForSent &&
              compareIsoTimestamps(
                profileToSync.createdAt,
                chainForSent.renamedAt
              ) <= 0
            ) {
              const targetKey = chainForSent.targetKey;
              const existingTarget = nextState.profiles[targetKey];
              const merged = existingTarget
                ? mergeProfiles(cleanServerProfile, existingTarget)
                : cleanServerProfile;
              const preservedNickname =
                existingTarget?.nickname ??
                (normalizeNicknameKey(cleanServerProfile.nickname) === targetKey
                  ? cleanServerProfile.nickname
                  : chainForSent.targetNickname);

              const nextProfiles = { ...nextState.profiles };
              delete nextProfiles[sentKey];
              nextProfiles[targetKey] = {
                ...merged,
                nickname: preservedNickname,
              };

              const nextActive =
                nextState.activeNickname &&
                (normalizeNicknameKey(nextState.activeNickname) === targetKey ||
                  normalizeNicknameKey(nextState.activeNickname) === sentKey)
                  ? preservedNickname
                  : nextState.activeNickname;

              nextState = {
                ...nextState,
                activeNickname: nextActive,
                profiles: nextProfiles,
              };
            } else {
              const returnedKey = normalizeNicknameKey(
                cleanServerProfile.nickname
              );
              const deletedAtForReturned =
                nextState.deletedNicknames?.[returnedKey];

              if (
                !deletedAtForReturned ||
                compareIsoTimestamps(
                  cleanServerProfile.createdAt,
                  deletedAtForReturned
                ) > 0
              ) {
                const latestLocal = nextState.profiles[returnedKey];
                const reconciled = latestLocal
                  ? mergeProfiles(cleanServerProfile, latestLocal)
                  : cleanServerProfile;

                const nextProfiles = { ...nextState.profiles };
                if (data.redirectedFrom) {
                  delete nextProfiles[
                    normalizeNicknameKey(data.redirectedFrom)
                  ];
                }
                nextProfiles[returnedKey] = reconciled;

                const nextActive =
                  nextState.activeNickname &&
                  normalizeNicknameKey(nextState.activeNickname) === returnedKey
                    ? reconciled.nickname
                    : nextState.activeNickname;

                nextState = {
                  ...nextState,
                  activeNickname: nextActive,
                  profiles: nextProfiles,
                };
              }
            }
          }
        }

        commitStore(nextState);
        applyServerDirectory(data, nextState);
      } catch {
        // Offline or network error: local state remains persisted in localStorage
      } finally {
        setSyncingCount((prev) => Math.max(0, prev - 1));
      }
    },
    [applyServerDirectory, commitStore]
  );

  const refreshLeaderboard = useCallback(async (): Promise<void> => {
    setSyncingCount((prev) => prev + 1);
    try {
      const res = await fetch(
        `/api/workouts?today=${encodeURIComponent(getTodayKey())}`,
        { cache: "no-store" }
      );
      if (!res.ok) {
        return;
      }
      const data = (await res.json()) as WorkoutsApiResponse;
      const incomingRenames = sanitizeRenamesMap(data.renames);
      const incomingDeleted = sanitizeDeletedNicknamesMap(
        data.deletedNicknames
      );
      const reconciled = reconcileLocalTombstones(
        storeRef.current,
        incomingRenames,
        incomingDeleted
      );
      commitStore(reconciled);
      applyServerDirectory(data, reconciled);
    } catch {
      // Ignore offline errors when refreshing leaderboard
    } finally {
      setSyncingCount((prev) => Math.max(0, prev - 1));
    }
  }, [applyServerDirectory, commitStore]);

  const syncNow = useCallback(async (): Promise<void> => {
    const currentStore = storeRef.current;
    const activeKey = currentStore.activeNickname
      ? normalizeNicknameKey(currentStore.activeNickname)
      : null;
    const activeProfile = activeKey ? currentStore.profiles[activeKey] : null;

    if (activeProfile) {
      await syncProfileWithApi(activeProfile);
    } else {
      await refreshLeaderboard();
    }
  }, [refreshLeaderboard, syncProfileWithApi]);

  useEffect(() => {
    const initial = readLocalStorageState();
    storeRef.current = initial;
    setStoreState(initial);
    setHydrated(true);

    const activeKey = initial.activeNickname
      ? normalizeNicknameKey(initial.activeNickname)
      : null;
    const activeProfile = activeKey ? initial.profiles[activeKey] : null;

    lastForegroundSyncRef.current = Date.now();
    if (activeProfile) {
      void syncProfileWithApi(activeProfile);
    } else {
      void refreshLeaderboard();
    }
  }, [refreshLeaderboard, syncProfileWithApi]);

  useEffect(() => {
    const handleForeground = (event: Event) => {
      if (
        event.type === "visibilitychange" &&
        document.visibilityState !== "visible"
      ) {
        return;
      }

      const latestToday = getTodayKey();
      setTodayKeyState((prev) => (prev === latestToday ? prev : latestToday));

      const nowMs = Date.now();
      if (nowMs - lastForegroundSyncRef.current >= 20_000) {
        lastForegroundSyncRef.current = nowMs;
        void syncNow();
      }
    };

    window.addEventListener("focus", handleForeground);
    document.addEventListener("visibilitychange", handleForeground);
    return () => {
      window.removeEventListener("focus", handleForeground);
      document.removeEventListener("visibilitychange", handleForeground);
    };
  }, [syncNow]);

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

      const nextRenames = { ...(currentStore.renames ?? {}) };
      const nextDeleted = { ...(currentStore.deletedNicknames ?? {}) };
      if (!hadLocal) {
        delete nextRenames[key];
        delete nextDeleted[key];
      }

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
        renames: nextRenames,
        deletedNicknames: nextDeleted,
      });

      if (hadLocal) {
        await syncProfileWithApi(optimisticProfile);
        return;
      }

      setSyncingCount((prev) => prev + 1);
      try {
        const getRes = await fetch(
          `/api/workouts?nickname=${encodeURIComponent(trimmed)}&today=${encodeURIComponent(getTodayKey())}`,
          { cache: "no-store" }
        );
        if (getRes.ok) {
          const data = (await getRes.json()) as WorkoutsApiResponse;
          const incomingRenames = sanitizeRenamesMap(data.renames);
          const incomingDeleted = sanitizeDeletedNicknamesMap(
            data.deletedNicknames
          );
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

            const mergedRenames = mergeRenamesMap(
              latestStore.renames,
              incomingRenames
            );
            const mergedDeleted = mergeDeletedMap(
              latestStore.deletedNicknames,
              incomingDeleted
            );
            delete mergedRenames[key];
            delete mergedDeleted[key];

            const nextState = reconcileLocalTombstones({
              activeNickname: nextActive,
              profiles: {
                ...latestStore.profiles,
                [key]: hydratedProfile,
              },
              renames: mergedRenames,
              deletedNicknames: mergedDeleted,
            });

            commitStore(nextState);
            applyServerDirectory(data, nextState);

            if (hasLocalWorkouts || hasLocalCategoryEdits) {
              await syncProfileWithApi(hydratedProfile);
            }
            return;
          }

          const updatedState = reconcileLocalTombstones(
            storeRef.current,
            incomingRenames,
            incomingDeleted
          );
          commitStore(updatedState);
          applyServerDirectory(data, updatedState);
        }
      } catch {
        // Ignore GET error and attempt sync fallback or stay offline
      } finally {
        setSyncingCount((prev) => Math.max(0, prev - 1));
      }

      const latestProfile = storeRef.current.profiles[key] ?? optimisticProfile;
      await syncProfileWithApi(latestProfile, { allowCreateNew: true });
    },
    [applyServerDirectory, commitStore, syncProfileWithApi]
  );

  const logoutNickname = useCallback((): void => {
    const currentStore = storeRef.current;
    commitStore({
      activeNickname: null,
      profiles: currentStore.profiles,
      renames: currentStore.renames,
      deletedNicknames: currentStore.deletedNicknames,
    });
    void refreshLeaderboard();
  }, [commitStore, refreshLeaderboard]);

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
      const nextRenames = { ...(currentStore.renames ?? {}) };
      const nextDeleted = { ...(currentStore.deletedNicknames ?? {}) };

      if (oldKey !== newKey) {
        delete nextProfiles[oldKey];
        nextRenames[oldKey] = {
          targetNickname: trimmed,
          renamedAt: nowIso,
        };
        for (const [k, rec] of Object.entries(nextRenames)) {
          if (normalizeNicknameKey(rec.targetNickname) === oldKey) {
            nextRenames[k] = {
              targetNickname: trimmed,
              renamedAt: nowIso,
            };
          }
        }
        delete nextRenames[newKey];
        delete nextDeleted[oldKey];
      }
      delete nextDeleted[newKey];
      nextProfiles[newKey] = renamedProfile;

      commitStore({
        activeNickname: trimmed,
        profiles: nextProfiles,
        renames: nextRenames,
        deletedNicknames: nextDeleted,
      });

      if (oldKey !== newKey) {
        setServerNicknames((prev) =>
          prev.filter((item) => normalizeNicknameKey(item.nickname) !== oldKey)
        );
        setServerLeaderboard((prev) =>
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
            profile: renamedProfile,
            todayKey: getTodayKey(),
          }),
        });
        if (res.ok) {
          const data = (await res.json()) as WorkoutsApiResponse;
          const incomingRenames = sanitizeRenamesMap(data.renames);
          const incomingDeleted = sanitizeDeletedNicknamesMap(
            data.deletedNicknames
          );

          let nextState = reconcileLocalTombstones(
            storeRef.current,
            incomingRenames,
            incomingDeleted
          );

          if (data.profile) {
            const cleanServer = sanitizeProfile(data.profile, nowIso);
            if (cleanServer) {
              const targetKey = normalizeNicknameKey(cleanServer.nickname);
              const latestLocal = nextState.profiles[targetKey];
              const reconciled = latestLocal
                ? mergeProfiles(cleanServer, latestLocal)
                : cleanServer;

              const updatedProfiles = { ...nextState.profiles };
              if (oldKey !== targetKey) {
                delete updatedProfiles[oldKey];
              }
              updatedProfiles[targetKey] = reconciled;

              nextState = {
                ...nextState,
                activeNickname:
                  nextState.activeNickname &&
                  (normalizeNicknameKey(nextState.activeNickname) ===
                    targetKey ||
                    normalizeNicknameKey(nextState.activeNickname) === oldKey)
                    ? reconciled.nickname
                    : nextState.activeNickname,
                profiles: updatedProfiles,
              };
            }
          }

          commitStore(nextState);
          applyServerDirectory(data, nextState);
        }
      } catch {
        // Offline fallback: rename already persisted in localStorage
      } finally {
        setSyncingCount((prev) => Math.max(0, prev - 1));
      }

      return true;
    },
    [applyServerDirectory, commitStore]
  );

  const deleteSavedNickname = useCallback(
    async (nickname: string): Promise<boolean> => {
      const trimmed = nickname.trim();
      if (!trimmed) {
        return false;
      }

      const targetKey = normalizeNicknameKey(trimmed);
      const currentStore = storeRef.current;
      const activeKey = currentStore.activeNickname
        ? normalizeNicknameKey(currentStore.activeNickname)
        : null;

      if (activeKey === targetKey) {
        return false;
      }

      const nowIso = new Date().toISOString();
      const nextProfiles = { ...currentStore.profiles };
      delete nextProfiles[targetKey];

      const nextDeleted = {
        ...(currentStore.deletedNicknames ?? {}),
        [targetKey]: nowIso,
      };
      const nextRenames = { ...(currentStore.renames ?? {}) };
      for (const [k, rec] of Object.entries(nextRenames)) {
        if (
          k === targetKey ||
          normalizeNicknameKey(rec.targetNickname) === targetKey
        ) {
          delete nextRenames[k];
        }
      }

      commitStore({
        activeNickname: currentStore.activeNickname,
        profiles: nextProfiles,
        renames: nextRenames,
        deletedNicknames: nextDeleted,
      });

      setServerNicknames((prev) =>
        prev.filter((item) => normalizeNicknameKey(item.nickname) !== targetKey)
      );
      setServerLeaderboard((prev) =>
        prev.filter((item) => normalizeNicknameKey(item.nickname) !== targetKey)
      );

      setSyncingCount((prev) => prev + 1);
      try {
        const res = await fetch("/api/workouts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "delete",
            nickname: trimmed,
            todayKey: getTodayKey(),
          }),
        });
        if (res.ok) {
          const data = (await res.json()) as WorkoutsApiResponse;
          const incomingRenames = sanitizeRenamesMap(data.renames);
          const incomingDeleted = sanitizeDeletedNicknamesMap(
            data.deletedNicknames
          );
          const nextState = reconcileLocalTombstones(
            storeRef.current,
            incomingRenames,
            incomingDeleted
          );
          commitStore(nextState);
          applyServerDirectory(data, nextState);
        }
      } catch {
        // Offline fallback: delete tombstone remains in localStorage
      } finally {
        setSyncingCount((prev) => Math.max(0, prev - 1));
      }

      return true;
    },
    [applyServerDirectory, commitStore]
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
      const nextRenames = { ...(currentStore.renames ?? {}) };
      const nextDeleted = { ...(currentStore.deletedNicknames ?? {}) };
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
        delete nextRenames[key];
        delete nextDeleted[key];
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
        renames: nextRenames,
        deletedNicknames: nextDeleted,
      });

      for (const key of Array.from(importedKeys)) {
        const profileToSync = nextProfiles[key];
        if (profileToSync) {
          await syncProfileWithApi(profileToSync, { allowCreateNew: true });
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
      if (isKeyTombstoned(key, storeState)) {
        continue;
      }
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
  }, [serverNicknames, storeState]);

  const leaderboard = useMemo<LeaderboardEntry[]>(() => {
    const todayKey = todayKeyState;
    const mergedMap = new Map<string, LeaderboardEntry>();

    for (const item of serverLeaderboard) {
      if (!item?.nickname) {
        continue;
      }
      const key = normalizeNicknameKey(item.nickname);
      if (isKeyTombstoned(key, storeState)) {
        continue;
      }
      mergedMap.set(key, item);
    }

    for (const [key, localProfile] of Object.entries(storeState.profiles)) {
      const localEntry = buildLocalLeaderboardEntry(localProfile, todayKey);
      const existing = mergedMap.get(key);
      if (
        !existing ||
        compareIsoTimestamps(localEntry.updatedAt, existing.updatedAt) >= 0
      ) {
        mergedMap.set(key, localEntry);
      }
    }

    return Array.from(mergedMap.values()).sort((a, b) => {
      if (b.monthCompleted !== a.monthCompleted) {
        return b.monthCompleted - a.monthCompleted;
      }
      if (b.currentStreak !== a.currentStreak) {
        return b.currentStreak - a.currentStreak;
      }
      if (b.totalCompleted !== a.totalCompleted) {
        return b.totalCompleted - a.totalCompleted;
      }
      if (b.totalMinutes !== a.totalMinutes) {
        return b.totalMinutes - a.totalMinutes;
      }
      return a.nickname.localeCompare(b.nickname);
    });
  }, [serverLeaderboard, storeState, todayKeyState]);

  return {
    hydrated,
    syncing: syncingCount > 0,
    activeNickname: profile ? profile.nickname : storeState.activeNickname,
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
  };
}
