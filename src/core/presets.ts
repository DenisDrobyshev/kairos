/**
 * Starting points.
 *
 * Thirteen sliders is a chore, and a chore at the front door is where most
 * people leave. A preset fills the whole day in one tap and puts you within
 * adjusting distance of your real life instead of at zero.
 *
 * None of these is meant to be right about you. They are meant to be close
 * enough that correcting them feels like editing rather than data entry, which
 * is a different and much smaller task.
 *
 * Every preset commits under 24 hours a day, and a test enforces that -- a
 * starting point that trips the impossible-day warning on arrival would be a
 * poor welcome.
 */

import type { Bucket } from "./taxonomy.js";

export interface Preset {
  readonly id: string;
  readonly labels: { readonly ru: string; readonly en: string };
  readonly note: { readonly ru: string; readonly en: string };
  readonly hours: Readonly<Record<string, number>>;
  readonly buckets?: Readonly<Record<string, Bucket>>;
  readonly workDaysPerWeek: number;
  readonly vacationDays: number;
}

export const PRESETS: readonly Preset[] = [
  {
    id: "student",
    labels: { ru: "Студент", en: "Student" },
    note: { ru: "Пары, дорога, много экрана", en: "Classes, commute, a lot of screen" },
    hours: {
      sleep: 8, work: 6, commute: 1.5, meals: 1.5, hygiene: 1, chores: 0.75,
      admin: 1, feeds: 2, video: 1.5, games: 0.5, people: 1.5, body: 0.5, craft: 1,
    },
    workDaysPerWeek: 5,
    vacationDays: 60,
  },
  {
    id: "office",
    labels: { ru: "Офис 5/2", en: "Office, five days" },
    note: { ru: "Полный день и дорога в обе стороны", en: "Full days and a commute both ways" },
    hours: {
      sleep: 7.5, work: 9, commute: 1.25, meals: 1.5, hygiene: 1, chores: 1.25,
      admin: 2, feeds: 1.5, video: 1.5, games: 0.25, people: 1, body: 0.5, craft: 0.5,
    },
    workDaysPerWeek: 5,
    vacationDays: 28,
  },
  {
    id: "remote",
    labels: { ru: "Удалёнка", en: "Remote" },
    note: { ru: "Без дороги, но быта больше", en: "No commute, more housework" },
    hours: {
      sleep: 8, work: 8, commute: 0, meals: 1.5, hygiene: 1, chores: 1.5,
      admin: 2, feeds: 1.5, video: 1.25, games: 0.5, people: 1.25, body: 0.75, craft: 1,
    },
    workDaysPerWeek: 5,
    vacationDays: 28,
  },
  {
    id: "parent",
    labels: { ru: "С детьми", en: "With children" },
    note: { ru: "Быта втрое, своего времени почти нет", en: "Three times the chores, almost no slack" },
    hours: {
      sleep: 7, work: 8, commute: 1, meals: 2, hygiene: 1, chores: 2.5,
      admin: 2, feeds: 1, video: 1, games: 0, people: 2.5, body: 0.25, craft: 0.25,
    },
    workDaysPerWeek: 5,
    vacationDays: 28,
  },
  {
    id: "shift",
    labels: { ru: "Сменный график", en: "Shift work" },
    note: { ru: "Длинные смены, меньше дней", en: "Long shifts, fewer days" },
    hours: {
      sleep: 7.5, work: 12, commute: 1, meals: 1.5, hygiene: 1, chores: 1.25,
      admin: 2, feeds: 1.5, video: 1.5, games: 0.5, people: 1.5, body: 0.5, craft: 0.5,
    },
    workDaysPerWeek: 4,
    vacationDays: 28,
  },
];

export const PRESET_BY_ID: ReadonlyMap<string, Preset> = new Map(
  PRESETS.map((p) => [p.id, p]),
);
