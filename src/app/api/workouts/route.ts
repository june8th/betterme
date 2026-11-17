import fs from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { matchWorkoutEmoji } from "@/lib/emoji-matcher";
import {
  DEFAULT_WORKOUT_CATEGORIES,
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
}

type GlobalWithBettermeStore = typeof globalThis & {
  __bettermeStore?: ServerWorkoutsStore;
  __bettermeReadOnlyFallback?: boolean;
};

const globalStoreHolder = globalThis as GlobalWithBettermeStore;

const PRIMARY_DATA_FILE = path.join(process.cwd(), "data", "workouts.json");
const TMP_DATA_FILE = "/tmp/betterme-workouts.json";

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
    return { version: 1, profiles };
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
  return { version: 1, profiles: mergedProfiles };
}

function readServerStore(): ServerWorkoutsStore {
  if (!globalStoreHolder.__bettermeReadOnlyFallback) {
    try {
      if (fs.existsSync(PRIMARY_DATA_FILE)) {
        const raw = fs.readFileSync(PRIMARY_DATA_FILE, "utf8");
        const parsed = parseStoreJson(raw);
        if (parsed) {
          globalStoreHolder.__bettermeStore = parsed;
          return parsed;
        }
      }
    } catch {
      // Ignore read errors and fall through to /tmp or memory fallback
    }

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

    return { version: 1, profiles: {} };
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

  const memStore = globalStoreHolder.__bettermeStore ?? {
    version: 1,
    profiles: {},
  };
  const combined = fileStore ? mergeStores(fileStore, memStore) : memStore;
  globalStoreHolder.__bettermeStore = combined;
  return combined;
}

function writeServerStore(store: ServerWorkoutsStore): void {
  globalStoreHolder.__bettermeStore = store;
  const serialized = JSON.stringify(store, null, 2);

  if (!globalStoreHolder.__bettermeReadOnlyFallback) {
    try {
      fs.mkdirSync(path.dirname(PRIMARY_DATA_FILE), { recursive: true });
      fs.writeFileSync(PRIMARY_DATA_FILE, serialized, "utf8");
      return;
    } catch {
      globalStoreHolder.__bettermeReadOnlyFallback = true;
    }
  }

  try {
    fs.writeFileSync(TMP_DATA_FILE, serialized, "utf8");
  } catch {
    // Even if /tmp is unavailable, globalThis.__bettermeStore retains state in-memory
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

export async function GET(request: NextRequest): Promise<NextResponse> {
  const store = readServerStore();
  const savedNicknames = buildSavedNicknames(store.profiles);
  const nicknameParam = request.nextUrl.searchParams.get("nickname");

  if (nicknameParam !== null && nicknameParam.trim().length > 0) {
    const key = normalizeNicknameKey(nicknameParam);
    const profile = store.profiles[key] ?? null;
    return NextResponse.json(
      { ok: true, profile, savedNicknames },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  return NextResponse.json(
    { ok: true, savedNicknames },
    { headers: { "Cache-Control": "no-store" } }
  );
}

interface SyncPayload extends RawProfileInput {
  action?: "sync";
  profile?: RawProfileInput;
}

interface RenamePayload {
  action: "rename";
  oldNickname?: string;
  newNickname?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: SyncPayload | RenamePayload;
  try {
    body = (await request.json()) as SyncPayload | RenamePayload;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const nowIso = new Date().toISOString();
  const store = readServerStore();

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

    let mergedProfile: UserProfileData;
    if (oldKey === newKey) {
      const categories = oldProfile
        ? oldProfile.categories.map((item) => ({ ...item }))
        : cloneDefaultCategories();
      const archivedCategories = oldProfile
        ? sanitizeArchivedCategories(oldProfile.archivedCategories, categories)
        : buildDefaultArchivedCategories();

      mergedProfile = {
        nickname: newTrimmed,
        createdAt: oldProfile?.createdAt ?? nowIso,
        updatedAt: nowIso,
        weeklyGoal: oldProfile?.weeklyGoal ?? 4,
        categories,
        archivedCategories,
        ...(oldProfile?.categoriesUpdatedAt
          ? { categoriesUpdatedAt: oldProfile.categoriesUpdatedAt }
          : {}),
        workouts: oldProfile?.workouts ?? {},
      };
      store.profiles[newKey] = mergedProfile;
    } else {
      const combinedWorkouts = mergeWorkouts(
        targetProfile?.workouts ?? {},
        oldProfile?.workouts ?? {}
      );
      const earliestCreatedAt =
        oldProfile && targetProfile
          ? compareIsoTimestamps(
                oldProfile.createdAt,
                targetProfile.createdAt
              ) <= 0
            ? oldProfile.createdAt
            : targetProfile.createdAt
          : (oldProfile?.createdAt ?? targetProfile?.createdAt ?? nowIso);

      let categoryState: {
        categories: WorkoutCategoryMeta[];
        archivedCategories: Record<string, WorkoutCategoryMeta>;
        categoriesUpdatedAt?: string;
      };

      if (targetProfile && oldProfile) {
        categoryState = mergeCategoryState(targetProfile, oldProfile, true);
      } else if (oldProfile) {
        categoryState = {
          categories: oldProfile.categories.map((item) => ({ ...item })),
          archivedCategories: sanitizeArchivedCategories(
            oldProfile.archivedCategories,
            oldProfile.categories
          ),
          ...(oldProfile.categoriesUpdatedAt
            ? { categoriesUpdatedAt: oldProfile.categoriesUpdatedAt }
            : {}),
        };
      } else if (targetProfile) {
        categoryState = {
          categories: targetProfile.categories.map((item) => ({ ...item })),
          archivedCategories: sanitizeArchivedCategories(
            targetProfile.archivedCategories,
            targetProfile.categories
          ),
          ...(targetProfile.categoriesUpdatedAt
            ? { categoriesUpdatedAt: targetProfile.categoriesUpdatedAt }
            : {}),
        };
      } else {
        categoryState = {
          categories: cloneDefaultCategories(),
          archivedCategories: buildDefaultArchivedCategories(),
        };
      }

      mergedProfile = {
        nickname: newTrimmed,
        createdAt: earliestCreatedAt,
        updatedAt: nowIso,
        weeklyGoal: oldProfile?.weeklyGoal ?? targetProfile?.weeklyGoal ?? 4,
        ...categoryState,
        workouts: combinedWorkouts,
      };
      store.profiles[newKey] = mergedProfile;
      delete store.profiles[oldKey];
    }

    writeServerStore(store);
    const savedNicknames = buildSavedNicknames(store.profiles);

    return NextResponse.json(
      { ok: true, profile: mergedProfile, savedNicknames },
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

    const incomingProfile = sanitizeProfile(rawProfile, nowIso);
    if (!incomingProfile) {
      return NextResponse.json(
        { ok: false, error: "Valid profile with nickname is required." },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const key = normalizeNicknameKey(incomingProfile.nickname);
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
    writeServerStore(store);
    const savedNicknames = buildSavedNicknames(store.profiles);

    return NextResponse.json(
      { ok: true, profile: mergedProfile, savedNicknames },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  return NextResponse.json(
    { ok: false, error: "Unsupported action." },
    { status: 400, headers: { "Cache-Control": "no-store" } }
  );
}
