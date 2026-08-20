/**
 * The ledger.
 *
 * Every "time left" calculator on the internet works by subtraction: start with
 * a lifespan, subtract sleep, subtract work, subtract chores, and present the
 * remainder as "your real life". That method has two defects, and this module
 * exists to avoid both.
 *
 * 1. Subtraction silently changes units. Once you remove sleep, what is left is
 *    no longer measured in 24-hour days, so any further "hours per day" figure
 *    subtracted from it is nonsense. The published versions of this arithmetic
 *    routinely land an order of magnitude too low because of it. Here everything
 *    accumulates in hours, from one horizon, and converts for display only.
 *
 * 2. Subtraction asserts that work, meals and commuting are not your life. That
 *    is a value judgement wearing a lab coat. Here each category is allocated to
 *    a bucket the user chooses, and the same hour can be `alive` for one person
 *    and `leak` for another.
 */

import {
  POPULATIONS,
  horizon,
  populationKey,
  type Region,
  type Sex,
  type Horizon,
} from "./mortality.js";
import { CATEGORIES, type Bucket, type Category } from "./taxonomy.js";

export const DAYS_PER_YEAR = 365.2425;
export const WEEKS_PER_YEAR = DAYS_PER_YEAR / 7;
export const HOURS_PER_YEAR = DAYS_PER_YEAR * 24;

/** Which point of the survival distribution to budget against. */
export type HorizonBasis = "median" | "mean" | "p10" | "p90";

export interface Profile {
  readonly age: number;
  readonly sex: Sex;
  readonly region: Region;
  /** Annual mortality improvement; 0 for a period table. */
  readonly improvement: number;
  readonly basis: HorizonBasis;
  readonly retirementAge: number;
  readonly workDaysPerWeek: number;
  readonly vacationDays: number;
  readonly hours: Readonly<Record<string, number>>;
  readonly buckets: Readonly<Record<string, Bucket>>;
}

export interface LedgerRow {
  readonly category: Category;
  readonly bucket: Bucket;
  readonly hoursPerUnit: number;
  /** Years over which this category actually accrues. */
  readonly activeYears: number;
  /** Total hours committed to this category over the whole horizon. */
  readonly totalHours: number;
  /** Hours added or removed per extra hour-per-unit -- the lever arm. */
  readonly leverArm: number;
  /** Share of the whole remaining horizon. */
  readonly share: number;
}

export interface Ledger {
  readonly horizon: Horizon;
  /** Age the budget runs to, per `basis`. */
  readonly endAge: number;
  readonly remainingYears: number;
  readonly totalHours: number;
  readonly rows: readonly LedgerRow[];
  readonly byBucket: Readonly<Record<Bucket, number>>;
  /** Hours committed to nothing at all -- genuinely open time. */
  readonly unallocatedHours: number;
  /** Hours per day the profile commits; over 24 means the input is impossible. */
  readonly committedHoursPerDay: number;
  readonly overcommitted: boolean;
}

function workdaysPerYear(p: Profile): number {
  return Math.max(0, WEEKS_PER_YEAR * p.workDaysPerWeek - p.vacationDays);
}

/** How many times per year a category's unit occurs, for this profile. */
function unitsPerYear(cat: Category, p: Profile): number {
  switch (cat.cadence) {
    case "daily":
      return DAYS_PER_YEAR;
    case "weekly":
      return WEEKS_PER_YEAR;
    case "workday":
      return workdaysPerYear(p);
  }
}

function endAgeFor(h: Horizon, basis: HorizonBasis, age: number): number {
  switch (basis) {
    case "median":
      return h.medianAge;
    case "mean":
      return age + h.expectancy;
    case "p10":
      return h.p10Age;
    case "p90":
      return h.p90Age;
  }
}

export function computeLedger(p: Profile): Ledger {
  const params = POPULATIONS[populationKey(p.region, p.sex)];
  const h = horizon(p.age, params, p.improvement);
  const endAge = endAgeFor(h, p.basis, p.age);
  const remainingYears = Math.max(0, endAge - p.age);
  const totalHours = remainingYears * HOURS_PER_YEAR;

  // Work stops at retirement, or at death if that arrives first.
  const workingYears = Math.max(0, Math.min(p.retirementAge, endAge) - p.age);

  const rows: LedgerRow[] = [];
  const byBucket: Record<Bucket, number> = { alive: 0, neutral: 0, leak: 0 };
  let perDay = 0;

  for (const cat of CATEGORIES) {
    const hoursPerUnit = p.hours[cat.id] ?? cat.defaultHours;
    const bucket = p.buckets[cat.id] ?? cat.defaultBucket;
    const activeYears = cat.phase === "working" ? workingYears : remainingYears;
    const perYear = unitsPerYear(cat, p);
    const leverArm = perYear * activeYears;
    const total = leverArm * hoursPerUnit;

    byBucket[bucket] += total;

    // The same arithmetic expressed as today's day, so an impossible profile
    // (more than 24 committed hours) is caught at input time rather than
    // surfacing later as a negative remainder.
    perDay += (perYear * hoursPerUnit) / DAYS_PER_YEAR;

    rows.push({
      category: cat,
      bucket,
      hoursPerUnit,
      activeYears,
      totalHours: total,
      leverArm,
      share: totalHours > 0 ? total / totalHours : 0,
    });
  }

  const committed = byBucket.alive + byBucket.neutral + byBucket.leak;

  return {
    horizon: h,
    endAge,
    remainingYears,
    totalHours,
    rows: rows.sort((a, b) => b.totalHours - a.totalHours),
    byBucket,
    unallocatedHours: totalHours - committed,
    committedHoursPerDay: perDay,
    overcommitted: perDay > 24,
  };
}

/** Hours to whole years, for display. Never round-trips back into "days". */
export function hoursToYears(hours: number): number {
  return hours / HOURS_PER_YEAR;
}

/**
 * Hours expressed as 24-hour days. Correct only for a full-day quantity; never
 * apply it to a residual that already had sleep removed. See the module note.
 */
export function hoursToFullDays(hours: number): number {
  return hours / 24;
}

/** Hours expressed as waking days, at a given sleep budget. */
export function hoursToWakingDays(hours: number, sleepHours: number): number {
  return hours / Math.max(1, 24 - sleepHours);
}
