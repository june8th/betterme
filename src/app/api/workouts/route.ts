import fs from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import {
  UserProfileData,
  WORKOUT_CATEGORIES,
  WorkoutCategory,
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

  return {
    nickname,
    createdAt,
    updatedAt,
    weeklyGoal,
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

  let latestUpdatedAt =
    compareIsoTimestamps(incomingProfile.updatedAt, baseProfile.updatedAt) >= 0
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

function parseStoreJson(rawJson: string): ServerWorkoutsStore | null {
  try {
    const parsed = JSON.parse(rawJson) as Partial<ServerWorkoutsStore>;
    if (!parsed || typeof parsed !== "object" || !parsed.profiles) {
      return null;
    }
    const nowIso = new Date().toISOString();
    const profiles: Record<string, UserProfileData> = {};
    for (const [, rawProfile] of Object.entries(parsed.profiles)) {
      const clean = sanitizeProfile(rawProfile, nowIso);
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
      mergedProfile = {
        nickname: newTrimmed,
        createdAt: oldProfile?.createdAt ?? nowIso,
        updatedAt: nowIso,
        weeklyGoal: oldProfile?.weeklyGoal ?? 4,
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
          ? compareIsoTimestamps(oldProfile.createdAt, targetProfile.createdAt) <= 0
            ? oldProfile.createdAt
            : targetProfile.createdAt
          : (oldProfile?.createdAt ?? targetProfile?.createdAt ?? nowIso);

      mergedProfile = {
        nickname: newTrimmed,
        createdAt: earliestCreatedAt,
        updatedAt: nowIso,
        weeklyGoal: oldProfile?.weeklyGoal ?? targetProfile?.weeklyGoal ?? 4,
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
