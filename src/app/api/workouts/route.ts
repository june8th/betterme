import fs from "fs";
import path from "path";
import { get, put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import {
  calculateStreaks,
  getMonthCompletedCount,
  getTodayKey,
} from "@/lib/date-utils";
import { matchWorkoutEmoji } from "@/lib/emoji-matcher";
import {
  DEFAULT_WORKOUT_CATEGORIES,
  LeaderboardEntry,
  NicknameRenameRecord,
  UserProfileData,
  WorkoutCategory,
  WorkoutCategoryMeta,
  WorkoutEntry,
} from "@/lib/workout-types";

export const dynamic = "force-dynamic";

interface SavedNicknameSummary {
  nickname: string;
  totalCompleted: number;
  updatedAt: string;
}

interface ServerWorkoutsStore {
  version: 1;
  profiles: Record<string, UserProfileData>;
  renames?: Record<string, NicknameRenameRecord>;
  deletedNicknames?: Record<string, string>;
}

type GlobalWithBettermeStore = typeof globalThis & {
  __bettermeStore?: ServerWorkoutsStore;
  __bettermeReadOnlyFallback?: boolean;
};

const globalStoreHolder = globalThis as GlobalWithBettermeStore;

const DEFAULT_PRIMARY_DATA_FILE = path.join(
  process.cwd(),
  "data",
  "workouts.json"
);
const TMP_DATA_FILE = "/tmp/betterme-workouts.json";
const BLOB_STORE_PATHNAME = "betterme/workouts-store-v1.json";

function getPrimaryDataFile(): string {
  const override = process.env.BETTERME_DATA_FILE?.trim();
  return override || DEFAULT_PRIMARY_DATA_FILE;
}

function hasCustomDataFile(): boolean {
  return Boolean(process.env.BETTERME_DATA_FILE?.trim());
}

function shouldUseVercelBlob(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN) && !hasCustomDataFile();
}

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

function resolveTodayKey(raw?: unknown): string {
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
    if (match) {
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      const check = new Date(Date.UTC(year, month - 1, day));
      if (
        check.getUTCFullYear() === year &&
        check.getUTCMonth() === month - 1 &&
        check.getUTCDate() === day
      ) {
        return trimmed;
      }
    }
  }
  return getTodayKey();
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

function sanitizeWorkoutsMap(
  rawWorkouts: unknown,
  fallbackIso: string
): Record<string, WorkoutEntry> {
  const sanitized: Record<string, WorkoutEntry> = {};
  if (!rawWorkouts || typeof rawWorkouts !== "object") {
    return sanitized;
  }

  for (const [dateKey, value] of Object.entries(
    rawWorkouts as Record<string, Partial<WorkoutEntry>>
  )) {
    const entry = sanitizeWorkoutEntry(dateKey, value, fallbackIso);
    if (entry) {
      sanitized[entry.date] = entry;
    }
  }
  return sanitized;
}

interface RawProfileInput {
  nickname?: string;
  createdAt?: string;
  updatedAt?: string;
  weeklyGoal?: number;
  categories?: unknown[];
  archivedCategories?: Record<string, unknown>;
  categoriesUpdatedAt?: string;
  workouts?: Record<string, Partial<WorkoutEntry>>;
}

function sanitizeProfile(
  raw: RawProfileInput | undefined,
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

  return {
    nickname,
    createdAt,
    updatedAt,
    weeklyGoal,
    categories,
    archivedCategories,
    ...(categoriesUpdatedAt ? { categoriesUpdatedAt } : {}),
    workouts: sanitizeWorkoutsMap(raw.workouts, updatedAt),
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

function mergeProfiles(
  baseProfile: UserProfileData,
  incomingProfile: UserProfileData,
  hasExplicitUpdatedAt: boolean
): UserProfileData {
  const mergedWorkouts = mergeWorkouts(
    baseProfile.workouts,
    incomingProfile.workouts
  );
  const incomingIsNewer =
    !hasExplicitUpdatedAt ||
    compareIsoTimestamps(incomingProfile.updatedAt, baseProfile.updatedAt) >= 0;

  const mergedCategoryState = mergeCategoryState(
    baseProfile,
    incomingProfile,
    incomingIsNewer
  );

  let latestUpdatedAt =
    compareIsoTimestamps(incomingProfile.updatedAt, baseProfile.updatedAt) >= 0
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

function reconcileServerStore(store: ServerWorkoutsStore): ServerWorkoutsStore {
  const profiles: Record<string, UserProfileData> = { ...store.profiles };
  const renames: Record<string, NicknameRenameRecord> = {
    ...(store.renames ?? {}),
  };
  const deletedNicknames: Record<string, string> = {
    ...(store.deletedNicknames ?? {}),
  };

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
      continue;
    }

    const existingTarget = profiles[chain.targetKey];
    if (existingTarget) {
      const merged = mergeProfiles(existingTarget, profile, true);
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
  }

  return {
    version: 1,
    profiles,
    renames,
    deletedNicknames,
  };
}

function parseStoreJson(rawJson: string): ServerWorkoutsStore | null {
  try {
    const parsed = JSON.parse(rawJson) as Partial<ServerWorkoutsStore>;
    if (!parsed || typeof parsed !== "object" || !parsed.profiles) {
      return null;
    }
    const nowIso = new Date().toISOString();
    const profiles: Record<string, UserProfileData> = {};
    for (const [, rawProfile] of Object.entries(parsed.profiles)) {
      const clean = sanitizeProfile(rawProfile as RawProfileInput, nowIso);
      if (clean) {
        const key = normalizeNicknameKey(clean.nickname);
        const existing = profiles[key];
        profiles[key] = existing ? mergeProfiles(existing, clean, true) : clean;
      }
    }
    const renames = sanitizeRenamesMap(parsed.renames);
    const deletedNicknames = sanitizeDeletedNicknamesMap(
      parsed.deletedNicknames
    );
    return reconcileServerStore({
      version: 1,
      profiles,
      renames,
      deletedNicknames,
    });
  } catch {
    return null;
  }
}

function mergeStores(
  storeA: ServerWorkoutsStore,
  storeB: ServerWorkoutsStore
): ServerWorkoutsStore {
  const mergedProfiles: Record<string, UserProfileData> = {
    ...storeA.profiles,
  };
  for (const [key, profileB] of Object.entries(storeB.profiles)) {
    const profileA = mergedProfiles[key];
    mergedProfiles[key] = profileA
      ? mergeProfiles(profileA, profileB, true)
      : profileB;
  }
  const mergedRenames = mergeRenamesMap(storeA.renames, storeB.renames);
  const mergedDeleted = mergeDeletedMap(
    storeA.deletedNicknames,
    storeB.deletedNicknames
  );
  return reconcileServerStore({
    version: 1,
    profiles: mergedProfiles,
    renames: mergedRenames,
    deletedNicknames: mergedDeleted,
  });
}

async function readServerStore(): Promise<ServerWorkoutsStore> {
  const emptyStore: ServerWorkoutsStore = {
    version: 1,
    profiles: {},
    renames: {},
    deletedNicknames: {},
  };

  if (shouldUseVercelBlob()) {
    try {
      const blobResult = await get(BLOB_STORE_PATHNAME, {
        access: "private",
        useCache: false,
      });
      if (blobResult && blobResult.statusCode === 200 && blobResult.stream) {
        const rawBlob = await new Response(blobResult.stream).text();
        const parsedBlob = parseStoreJson(rawBlob);
        if (parsedBlob) {
          globalStoreHolder.__bettermeStore = parsedBlob;
          return parsedBlob;
        }
      }
    } catch {
      if (globalStoreHolder.__bettermeStore) {
        return reconcileServerStore(globalStoreHolder.__bettermeStore);
      }
    }

    // First-time fallback if Blob does not yet contain the store object
    try {
      if (fs.existsSync(TMP_DATA_FILE)) {
        const rawTmp = fs.readFileSync(TMP_DATA_FILE, "utf8");
        const parsedTmp = parseStoreJson(rawTmp);
        if (parsedTmp) {
          globalStoreHolder.__bettermeStore = parsedTmp;
          return parsedTmp;
        }
      }
    } catch {
      // Ignore /tmp read errors
    }

    return globalStoreHolder.__bettermeStore
      ? reconcileServerStore(globalStoreHolder.__bettermeStore)
      : emptyStore;
  }

  const primaryDataFile = getPrimaryDataFile();
  const customFileMode = hasCustomDataFile();

  if (!globalStoreHolder.__bettermeReadOnlyFallback || customFileMode) {
    try {
      if (fs.existsSync(primaryDataFile)) {
        const raw = fs.readFileSync(primaryDataFile, "utf8");
        const parsed = parseStoreJson(raw);
        if (parsed) {
          globalStoreHolder.__bettermeStore = parsed;
          return parsed;
        }
      }
    } catch {
      // Ignore read errors and fall through to /tmp or memory fallback
    }

    if (!customFileMode) {
      try {
        if (fs.existsSync(TMP_DATA_FILE)) {
          const rawTmp = fs.readFileSync(TMP_DATA_FILE, "utf8");
          const parsedTmp = parseStoreJson(rawTmp);
          if (parsedTmp) {
            globalStoreHolder.__bettermeStore = parsedTmp;
            return parsedTmp;
          }
        }
      } catch {
        // Ignore /tmp read errors
      }
    }

    return emptyStore;
  }

  let fileStore: ServerWorkoutsStore | null = null;
  try {
    if (fs.existsSync(TMP_DATA_FILE)) {
      const rawTmp = fs.readFileSync(TMP_DATA_FILE, "utf8");
      fileStore = parseStoreJson(rawTmp);
    }
  } catch {
    fileStore = null;
  }

  const memStore = globalStoreHolder.__bettermeStore ?? emptyStore;
  const combined = fileStore
    ? mergeStores(fileStore, memStore)
    : reconcileServerStore(memStore);
  globalStoreHolder.__bettermeStore = combined;
  return combined;
}

async function writeServerStore(store: ServerWorkoutsStore): Promise<void> {
  const cleanStore = reconcileServerStore(store);
  globalStoreHolder.__bettermeStore = cleanStore;
  const serialized = JSON.stringify(cleanStore, null, 2);

  if (shouldUseVercelBlob()) {
    try {
      await put(BLOB_STORE_PATHNAME, serialized, {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "application/json",
      });
      return;
    } catch {
      // Fall through to /tmp cache if Blob temporarily fails
    }
  }

  const primaryDataFile = getPrimaryDataFile();
  const customFileMode = hasCustomDataFile();

  if (!globalStoreHolder.__bettermeReadOnlyFallback || customFileMode) {
    try {
      fs.mkdirSync(path.dirname(primaryDataFile), { recursive: true });
      fs.writeFileSync(primaryDataFile, serialized, "utf8");
      return;
    } catch {
      if (!customFileMode) {
        globalStoreHolder.__bettermeReadOnlyFallback = true;
      }
    }
  }

  if (!customFileMode) {
    try {
      fs.writeFileSync(TMP_DATA_FILE, serialized, "utf8");
    } catch {
      // Even if /tmp is unavailable, globalThis.__bettermeStore retains state in-memory
    }
  }
}

function buildSavedNicknames(
  profiles: Record<string, UserProfileData>
): SavedNicknameSummary[] {
  return Object.values(profiles)
    .map((profile) => {
      let totalCompleted = 0;
      for (const entry of Object.values(profile.workouts)) {
        if (entry?.completed) {
          totalCompleted += 1;
        }
      }
      return {
        nickname: profile.nickname,
        totalCompleted,
        updatedAt: profile.updatedAt,
      };
    })
    .sort((a, b) => compareIsoTimestamps(b.updatedAt, a.updatedAt));
}

function buildLeaderboard(
  profiles: Record<string, UserProfileData>,
  todayKey: string
): LeaderboardEntry[] {
  const { year, monthIndex0 } = parseDateKeyYearMonth(todayKey);

  return Object.values(profiles)
    .map((profile) => {
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
    })
    .sort((a, b) => {
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
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const store = await readServerStore();
  const todayKey = resolveTodayKey(request.nextUrl.searchParams.get("today"));
  const savedNicknames = buildSavedNicknames(store.profiles);
  const leaderboard = buildLeaderboard(store.profiles, todayKey);
  const nicknameParam = request.nextUrl.searchParams.get("nickname");

  const renames = store.renames ?? {};
  const deletedNicknames = store.deletedNicknames ?? {};

  if (nicknameParam !== null && nicknameParam.trim().length > 0) {
    const key = normalizeNicknameKey(nicknameParam);
    const profile = store.profiles[key] ?? null;
    return NextResponse.json(
      { ok: true, profile, savedNicknames, leaderboard, renames, deletedNicknames },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  return NextResponse.json(
    { ok: true, savedNicknames, leaderboard, renames, deletedNicknames },
    { headers: { "Cache-Control": "no-store" } }
  );
}

interface SyncPayload extends RawProfileInput {
  action?: "sync";
  profile?: RawProfileInput;
  allowCreateNew?: boolean;
  todayKey?: string;
}

interface RenamePayload {
  action: "rename";
  oldNickname?: string;
  newNickname?: string;
  profile?: RawProfileInput;
  todayKey?: string;
}

interface DeletePayload {
  action: "delete";
  nickname?: string;
  todayKey?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: SyncPayload | RenamePayload | DeletePayload;
  try {
    body = (await request.json()) as
      | SyncPayload
      | RenamePayload
      | DeletePayload;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const nowIso = new Date().toISOString();
  const todayKey = resolveTodayKey(body.todayKey);
  const store = await readServerStore();
  if (!store.renames) {
    store.renames = {};
  }
  if (!store.deletedNicknames) {
    store.deletedNicknames = {};
  }

  if (body.action === "rename") {
    const oldTrimmed =
      typeof body.oldNickname === "string" ? body.oldNickname.trim() : "";
    const newTrimmed =
      typeof body.newNickname === "string" ? body.newNickname.trim() : "";

    if (!oldTrimmed || !newTrimmed) {
      return NextResponse.json(
        { ok: false, error: "Both oldNickname and newNickname are required." },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const oldKey = normalizeNicknameKey(oldTrimmed);
    const newKey = normalizeNicknameKey(newTrimmed);
    const oldProfile = store.profiles[oldKey];
    const targetProfile = store.profiles[newKey];
    const incomingRenameProfile = body.profile
      ? sanitizeProfile(body.profile, nowIso)
      : null;

    let mergedProfile: UserProfileData;
    if (oldKey === newKey) {
      const baseSame =
        oldProfile && incomingRenameProfile
          ? mergeProfiles(oldProfile, incomingRenameProfile, true)
          : (oldProfile ?? incomingRenameProfile);
      const categories = baseSame
        ? baseSame.categories.map((item) => ({ ...item }))
        : cloneDefaultCategories();
      const archivedCategories = baseSame
        ? sanitizeArchivedCategories(baseSame.archivedCategories, categories)
        : buildDefaultArchivedCategories();

      mergedProfile = {
        nickname: newTrimmed,
        createdAt: baseSame?.createdAt ?? nowIso,
        updatedAt: nowIso,
        weeklyGoal: baseSame?.weeklyGoal ?? 4,
        categories,
        archivedCategories,
        ...(baseSame?.categoriesUpdatedAt
          ? { categoriesUpdatedAt: baseSame.categoriesUpdatedAt }
          : {}),
        workouts: baseSame?.workouts ?? {},
      };
      store.profiles[newKey] = mergedProfile;
      delete store.deletedNicknames[newKey];
    } else {
      let combinedProfile: UserProfileData | null = null;
      if (targetProfile && oldProfile) {
        combinedProfile = mergeProfiles(targetProfile, oldProfile, true);
      } else {
        combinedProfile = oldProfile ?? targetProfile ?? null;
      }
      if (combinedProfile && incomingRenameProfile) {
        combinedProfile = mergeProfiles(
          combinedProfile,
          incomingRenameProfile,
          true
        );
      } else if (!combinedProfile && incomingRenameProfile) {
        combinedProfile = incomingRenameProfile;
      }

      if (combinedProfile) {
        mergedProfile = {
          ...combinedProfile,
          nickname: newTrimmed,
          updatedAt: nowIso,
        };
      } else {
        mergedProfile = {
          nickname: newTrimmed,
          createdAt: nowIso,
          updatedAt: nowIso,
          weeklyGoal: 4,
          categories: cloneDefaultCategories(),
          archivedCategories: buildDefaultArchivedCategories(),
          workouts: {},
        };
      }
      store.profiles[newKey] = mergedProfile;
      delete store.profiles[oldKey];

      store.renames[oldKey] = {
        targetNickname: newTrimmed,
        renamedAt: nowIso,
      };
      for (const [k, rec] of Object.entries(store.renames)) {
        if (normalizeNicknameKey(rec.targetNickname) === oldKey) {
          store.renames[k] = {
            targetNickname: newTrimmed,
            renamedAt: nowIso,
          };
        }
      }
      delete store.renames[newKey];
      delete store.deletedNicknames[newKey];
      delete store.deletedNicknames[oldKey];
    }

    await writeServerStore(store);
    const savedNicknames = buildSavedNicknames(store.profiles);
    const leaderboard = buildLeaderboard(store.profiles, todayKey);

    return NextResponse.json(
      {
        ok: true,
        profile: mergedProfile,
        savedNicknames,
        leaderboard,
        renames: store.renames,
        deletedNicknames: store.deletedNicknames,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  if (body.action === "delete") {
    const trimmed =
      typeof body.nickname === "string" ? body.nickname.trim() : "";
    if (!trimmed) {
      return NextResponse.json(
        { ok: false, error: "Nickname is required to delete." },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const targetKey = normalizeNicknameKey(trimmed);
    delete store.profiles[targetKey];
    store.deletedNicknames[targetKey] = nowIso;

    for (const [k, rec] of Object.entries(store.renames)) {
      if (
        k === targetKey ||
        normalizeNicknameKey(rec.targetNickname) === targetKey
      ) {
        delete store.renames[k];
      }
    }

    await writeServerStore(store);
    const savedNicknames = buildSavedNicknames(store.profiles);
    const leaderboard = buildLeaderboard(store.profiles, todayKey);

    return NextResponse.json(
      {
        ok: true,
        deletedNickname: targetKey,
        savedNicknames,
        leaderboard,
        renames: store.renames,
        deletedNicknames: store.deletedNicknames,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  if (!body.action || body.action === "sync") {
    const syncBody = body as SyncPayload;
    const rawProfile: RawProfileInput | undefined =
      syncBody.profile ?? syncBody;
    const hasExplicitUpdatedAt =
      typeof rawProfile?.updatedAt === "string" &&
      rawProfile.updatedAt.trim().length > 0;
    const allowCreateNew = Boolean(syncBody.allowCreateNew);

    const incomingProfile = sanitizeProfile(rawProfile, nowIso);
    if (!incomingProfile) {
      return NextResponse.json(
        { ok: false, error: "Valid profile with nickname is required." },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const key = normalizeNicknameKey(incomingProfile.nickname);
    const renameInfo = resolveRenameChain(key, store.renames);

    if (renameInfo) {
      if (
        allowCreateNew &&
        compareIsoTimestamps(incomingProfile.createdAt, renameInfo.renamedAt) > 0
      ) {
        delete store.renames[key];
      } else {
        const targetKey = renameInfo.targetKey;
        const targetDeletedAt = store.deletedNicknames[targetKey];
        if (
          targetDeletedAt &&
          compareIsoTimestamps(incomingProfile.createdAt, targetDeletedAt) <= 0
        ) {
          delete store.profiles[key];
          delete store.profiles[targetKey];
          await writeServerStore(store);
          const savedNicknames = buildSavedNicknames(store.profiles);
          const leaderboard = buildLeaderboard(store.profiles, todayKey);
          return NextResponse.json(
            {
              ok: true,
              profile: null,
              deleted: true,
              savedNicknames,
              leaderboard,
              renames: store.renames,
              deletedNicknames: store.deletedNicknames,
            },
            { headers: { "Cache-Control": "no-store" } }
          );
        }

        const existingTarget = store.profiles[targetKey];
        const redirectedProfile: UserProfileData = existingTarget
          ? {
              ...mergeProfiles(
                existingTarget,
                {
                  ...incomingProfile,
                  weeklyGoal:
                    typeof rawProfile?.weeklyGoal === "number"
                      ? incomingProfile.weeklyGoal
                      : existingTarget.weeklyGoal,
                },
                hasExplicitUpdatedAt
              ),
              nickname: existingTarget.nickname,
            }
          : {
              ...incomingProfile,
              nickname: renameInfo.targetNickname,
            };

        store.profiles[targetKey] = redirectedProfile;
        delete store.profiles[key];

        await writeServerStore(store);
        const savedNicknames = buildSavedNicknames(store.profiles);
        const leaderboard = buildLeaderboard(store.profiles, todayKey);

        return NextResponse.json(
          {
            ok: true,
            profile: store.profiles[targetKey],
            redirectedFrom: key,
            savedNicknames,
            leaderboard,
            renames: store.renames,
            deletedNicknames: store.deletedNicknames,
          },
          { headers: { "Cache-Control": "no-store" } }
        );
      }
    }

    const deletedAt = store.deletedNicknames[key];
    if (deletedAt) {
      if (
        allowCreateNew &&
        compareIsoTimestamps(incomingProfile.createdAt, deletedAt) > 0
      ) {
        delete store.deletedNicknames[key];
      } else {
        delete store.profiles[key];
        await writeServerStore(store);
        const savedNicknames = buildSavedNicknames(store.profiles);
        const leaderboard = buildLeaderboard(store.profiles, todayKey);

        return NextResponse.json(
          {
            ok: true,
            profile: null,
            deleted: true,
            savedNicknames,
            leaderboard,
            renames: store.renames,
            deletedNicknames: store.deletedNicknames,
          },
          { headers: { "Cache-Control": "no-store" } }
        );
      }
    }

    const existingProfile = store.profiles[key];
    const mergedProfile: UserProfileData = existingProfile
      ? mergeProfiles(
          existingProfile,
          {
            ...incomingProfile,
            weeklyGoal:
              typeof rawProfile?.weeklyGoal === "number"
                ? incomingProfile.weeklyGoal
                : existingProfile.weeklyGoal,
          },
          hasExplicitUpdatedAt
        )
      : incomingProfile;

    store.profiles[key] = mergedProfile;
    await writeServerStore(store);
    const savedNicknames = buildSavedNicknames(store.profiles);
    const leaderboard = buildLeaderboard(store.profiles, todayKey);

    return NextResponse.json(
      {
        ok: true,
        profile: mergedProfile,
        savedNicknames,
        leaderboard,
        renames: store.renames,
        deletedNicknames: store.deletedNicknames,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  return NextResponse.json(
    { ok: false, error: "Unsupported action." },
    { status: 400, headers: { "Cache-Control": "no-store" } }
  );
}
