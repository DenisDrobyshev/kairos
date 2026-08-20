/**
 * Levers.
 *
 * A total is inert -- nobody changes behaviour because a number is large. What
 * moves people is the exchange rate: one hour a day, held for the rest of your
 * life, is worth roughly two and a half years. This module computes that rate
 * for every category, and for the handful of structural choices (retirement
 * age, four-day week, remote work) that dwarf any daily habit.
 *
 * Levers are ranked by magnitude, not by how virtuous they sound.
 */

import { computeLedger, DAYS_PER_YEAR, type Ledger, type Profile } from "./budget.js";

export interface Lever {
  readonly id: string;
  /** i18n key, resolved under the `levers` namespace. */
  readonly key: string;
  /** Substitution values for the i18n template. */
  readonly vars: Readonly<Record<string, string | number>>;
  /** Hours freed (positive) or spent (negative) over the whole horizon. */
  readonly deltaHours: number;
  readonly kind: "habit" | "structural";
}

/** What one hour per day is worth, sustained for the rest of the horizon. */
export function dailyHourValue(ledger: Ledger): number {
  return ledger.remainingYears * DAYS_PER_YEAR;
}

function withProfile(base: Profile, patch: Partial<Profile>): Ledger {
  return computeLedger({ ...base, ...patch });
}

export function levers(profile: Profile): readonly Lever[] {
  const base = computeLedger(profile);
  const out: Lever[] = [];

  // Habit levers cover leaks only.
  //
  // An earlier version also pulled in any category above a size threshold,
  // which meant the tool cheerfully recommended cutting an hour of sleep or of
  // meals to whoever had not reclassified them. That inverts the whole design:
  // the user decides what counts as waste, and the arithmetic does not get to
  // overrule them. If someone believes their sleep is a leak, they can mark it
  // so, and it appears here.
  for (const row of base.rows) {
    if (row.hoursPerUnit <= 0) continue;
    if (row.bucket !== "leak") continue;
    const cut = Math.min(1, row.hoursPerUnit);
    out.push({
      id: `cut:${row.category.id}`,
      key: row.category.cadence === "daily" ? "cutDaily" : "cutUnit",
      vars: { category: row.category.id, hours: cut },
      deltaHours: row.leverArm * cut,
      kind: "habit",
    });
  }

  // Structural levers. These are one-time decisions rather than daily
  // discipline, which is exactly why they tend to win.
  const noCommute = withProfile(profile, {
    hours: { ...profile.hours, commute: 0 },
  });
  out.push({
    id: "remote",
    key: "remote",
    vars: {},
    deltaHours: noCommute.unallocatedHours - base.unallocatedHours,
    kind: "structural",
  });

  if (profile.workDaysPerWeek > 4) {
    const fourDay = withProfile(profile, { workDaysPerWeek: 4 });
    out.push({
      id: "fourDayWeek",
      key: "fourDayWeek",
      vars: {},
      deltaHours: fourDay.unallocatedHours - base.unallocatedHours,
      kind: "structural",
    });
  }

  const earlyRetire = withProfile(profile, {
    retirementAge: Math.max(profile.age, profile.retirementAge - 5),
  });
  out.push({
    id: "retireEarly",
    key: "retireEarly",
    vars: { years: 5 },
    deltaHours: earlyRetire.unallocatedHours - base.unallocatedHours,
    kind: "structural",
  });

  const moreVacation = withProfile(profile, {
    vacationDays: profile.vacationDays + 10,
  });
  out.push({
    id: "vacation",
    key: "vacation",
    vars: { days: 10 },
    deltaHours: moreVacation.unallocatedHours - base.unallocatedHours,
    kind: "structural",
  });

  return out
    .filter((l) => Math.abs(l.deltaHours) > 1)
    .sort((a, b) => Math.abs(b.deltaHours) - Math.abs(a.deltaHours));
}

/**
 * Re-bucketing frees no hours, so it is not a lever in the same sense -- but it
 * is the cheapest change available and for most people the honest one. This
 * reports how much of the horizon would change bucket if a category were
 * reclassified, making "decide that your commute counts" visible as a choice
 * with a magnitude attached.
 */
export function rebucketValue(ledger: Ledger, categoryId: string): number {
  return ledger.rows.find((r) => r.category.id === categoryId)?.totalHours ?? 0;
}
