export type WorkoutCategory = "home" | "cardio" | "strength" | "stretch" | "walk";

export interface WorkoutEntry {
  date: string; // "YYYY-MM-DD" in local timezone
  completed: boolean;
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
  workouts: Record<string, WorkoutEntry>;
}

export interface WorkoutCategoryMeta {
  id: WorkoutCategory;
  label: string;
  emoji: string;
}

export const WORKOUT_CATEGORIES: WorkoutCategoryMeta[] = [
  { id: "home", label: "홈트", emoji: "🏠" },
  { id: "cardio", label: "러닝·유산소", emoji: "🏃" },
  { id: "strength", label: "웨이트", emoji: "💪" },
  { id: "stretch", label: "스트레칭·요가", emoji: "🧘" },
  { id: "walk", label: "산책·걷기", emoji: "👟" },
];
