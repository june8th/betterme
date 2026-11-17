export type DefaultWorkoutCategoryId =
  | "home"
  | "cardio"
  | "strength"
  | "stretch"
  | "walk";

export type WorkoutCategory = string;

export interface WorkoutCategoryMeta {
  id: WorkoutCategory;
  label: string;
  emoji: string;
}

export interface WorkoutEntry {
  date: string; // "YYYY-MM-DD" in local timezone
  completed: boolean;
  categories?: WorkoutCategory[];
  category?: WorkoutCategory;
  durationMinutes?: number;
  note?: string;
  updatedAt: string; // ISO timestamp
}

export interface UserProfileData {
  nickname: string;
  createdAt: string;
  updatedAt: string;
  weeklyGoal: number;
  categories: WorkoutCategoryMeta[];
  archivedCategories?: Record<string, WorkoutCategoryMeta>;
  categoriesUpdatedAt?: string;
  workouts: Record<string, WorkoutEntry>;
}

export const DEFAULT_WORKOUT_CATEGORIES: WorkoutCategoryMeta[] = [
  { id: "home", label: "홈트", emoji: "🏠" },
  { id: "cardio", label: "러닝·유산소", emoji: "🏃" },
  { id: "strength", label: "웨이트", emoji: "💪" },
  { id: "stretch", label: "스트레칭·요가", emoji: "🧘" },
  { id: "walk", label: "산책·걷기", emoji: "👟" },
];

export const WORKOUT_CATEGORIES: WorkoutCategoryMeta[] =
  DEFAULT_WORKOUT_CATEGORIES;

export function getEntryCategoryIds(
  entry?: WorkoutEntry | null
): WorkoutCategory[] {
  if (!entry || typeof entry !== "object") {
    return [];
  }

  if (Array.isArray(entry.categories) && entry.categories.length > 0) {
    const seen = new Set<string>();
    const result: WorkoutCategory[] = [];
    for (const rawId of entry.categories) {
      if (typeof rawId !== "string") {
        continue;
      }
      const trimmed = rawId.trim();
      if (trimmed.length > 0 && !seen.has(trimmed)) {
        seen.add(trimmed);
        result.push(trimmed);
      }
    }
    if (result.length > 0) {
      return result;
    }
  }

  if (typeof entry.category === "string") {
    const trimmed = entry.category.trim();
    if (trimmed.length > 0) {
      return [trimmed];
    }
  }

  return [];
}

export function resolveCategoryMeta(
  categoryId: WorkoutCategory,
  profile?: Pick<UserProfileData, "categories" | "archivedCategories"> | null
): WorkoutCategoryMeta | undefined {
  if (typeof categoryId !== "string") {
    return undefined;
  }
  const trimmedId = categoryId.trim();
  if (!trimmedId) {
    return undefined;
  }

  if (Array.isArray(profile?.categories)) {
    const activeMatch = profile.categories.find(
      (item) => item.id === trimmedId
    );
    if (activeMatch) {
      return activeMatch;
    }
  }

  const archivedMatch = profile?.archivedCategories?.[trimmedId];
  if (archivedMatch) {
    return archivedMatch;
  }

  return DEFAULT_WORKOUT_CATEGORIES.find((item) => item.id === trimmedId);
}
