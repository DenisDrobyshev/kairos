/**
 * The planner: given a target, what to actually change.
 *
 * `sensitivity.ts` answers "what would each change be worth". That is a list of
 * possibilities, not a plan. This module answers the question a person actually
 * has -- "I want N hours a day of my own; what do I do?" -- by picking the
 * cheapest combination of changes that gets there.
 *
 * Two rules keep it honest.
 *
 * Cheapest first, by *your* cost, not by size. Every category carries a
 * resistance and a floor, so the planner reaches for an hour of scrolling long
 * before it reaches for an hour of sleep, and never proposes sleeping less than
 * seven hours no matter how far short the target falls.
 *
 * Free moves are labelled as free, and separately. Overlapping a commute with
 * something you value creates no time at all -- it relabels hours you were
 * spending anyway. That is genuinely valuable and it is genuinely not the same
 * as giving something up, so the plan never blurs the two. Presenting a pile of
 * relabelled hours as "freed" would be the same species of lie this whole
 * project exists to correct.
 */

import {
  CATEGORIES,
  CATEGORY_BY_ID,
  type Bucket,
  type Category,
} from "./taxonomy.js";
import {
  DAYS_PER_YEAR,
  WEEKS_PER_YEAR,
  computeLedger,
  type Profile,
} from "./budget.js";

/** Hours a day that are yours: not spent on cost, not spent on leak. */
export function ownTimePerDay(p: Profile): number {
  const ledger = computeLedger(p);
  let taken = 0;
  for (const row of ledger.rows) {
    if (row.bucket === "alive") continue;
    taken += perDay(row.category, row.hoursPerUnit, p);
  }
  // Hours the host gave away to an `alive` guest are no longer cost or leak.
  for (const [hostId, overlap] of Object.entries(p.during)) {
    const host = CATEGORY_BY_ID.get(hostId);
    const guest = CATEGORY_BY_ID.get(overlap.activity);
    if (!host || !guest) continue;
    const hostBucket = p.buckets[hostId] ?? host.defaultBucket;
    const guestBucket = p.buckets[guest.id] ?? guest.defaultBucket;
    if (hostBucket === "alive" || guestBucket !== "alive") continue;
    const shared = Math.min(overlap.hours, p.hours[hostId] ?? host.defaultHours);
    taken -= perDay(host, shared, p);
  }
  return Math.max(0, 24 - taken);
}

/** A category's figure expressed as hours per calendar day. */
function perDay(cat: Category, hours: number, p: Profile): number {
  switch (cat.cadence) {
    case "daily":
      return hours;
    case "weekly":
      return (hours * WEEKS_PER_YEAR) / DAYS_PER_YEAR;
    case "workday":
      return (
        (hours * Math.max(0, WEEKS_PER_YEAR * p.workDaysPerWeek - p.vacationDays)) /
        DAYS_PER_YEAR
      );
  }
}

export type StepKind = "overlap" | "cut" | "structural";

export interface PlanStep {
  readonly kind: StepKind;
  /** i18n key under `plan.step`. */
  readonly key: string;
  readonly categoryId: string;
  /** For an overlap, the activity to run on top. */
  readonly guestId?: string;
  /** Change in the category's own cadence. */
  readonly hours: number;
  /** Hours per day this step yields. */
  readonly gainPerDay: number;
  /** What it costs you, 0 (free) to 10 (do not). */
  readonly effort: number;
}

export interface Plan {
  readonly currentPerDay: number;
  readonly targetPerDay: number;
  /** Steps that relabel hours without taking anything away. */
  readonly free: readonly PlanStep[];
  /** Steps that genuinely take time from something else. */
  readonly costly: readonly PlanStep[];
  readonly achievedPerDay: number;
  /** Hours a day still missing once every allowed move is used up. */
  readonly shortfallPerDay: number;
  readonly reachable: boolean;
}

/** Hours a day the profile could reach if every allowed move were taken. */
function candidates(p: Profile): PlanStep[] {
  const steps: PlanStep[] = [];
  const bucketOf = (c: Category): Bucket => p.buckets[c.id] ?? c.defaultBucket;
  const hoursOf = (c: Category): number => p.hours[c.id] ?? c.defaultHours;

  // The cheapest move in the model: an hour you already spend, spent on
  // something you value. Costs nothing, so it always sorts first.
  const guests = CATEGORIES.filter((c) => c.canOverlap && bucketOf(c) === "alive");
  for (const host of CATEGORIES) {
    if (!host.canHost || !host.overlapCap) continue;
    if (bucketOf(host) === "alive") continue;
    if (p.during[host.id]) continue; // already carrying something
    const hostHours = hoursOf(host);
    if (hostHours <= 0 || guests.length === 0) continue;

    // Prefer a pairing that makes sense for this host, and among those the one
    // the person already does most, so the suggestion is a habit they have
    // rather than one they must invent.
    const plausible = (host.overlapPrefers ?? [])
      .map((id) => guests.find((g) => g.id === id))
      .filter((g): g is Category => g !== undefined);
    const guest = (plausible.length > 0 ? plausible : [...guests])
      .sort((a, b) => hoursOf(b) - hoursOf(a))[0]!;
    const shared = hostHours * host.overlapCap;
    steps.push({
      kind: "overlap",
      key: "overlap",
      categoryId: host.id,
      guestId: guest.id,
      hours: shared,
      gainPerDay: perDay(host, shared, p),
      effort: 0,
    });
  }

  // Giving something up. Only cost and leak are candidates: cutting what you
  // marked as living would defeat the point of asking for more of it.
  for (const cat of CATEGORIES) {
    if (bucketOf(cat) === "alive") continue;
    if (cat.resistance === undefined) continue;
    if (cat.id === "work") continue; // handled structurally, below
    const floor = cat.floorHours ?? 0;
    const available = hoursOf(cat) - floor;
    if (available <= 0.01) continue;
    steps.push({
      kind: "cut",
      key: "cut",
      categoryId: cat.id,
      hours: available,
      gainPerDay: perDay(cat, available, p),
      effort: cat.resistance,
    });
  }

  // Structural moves are all-or-nothing rather than dial-able.
  if (p.workDaysPerWeek > 4) {
    const fewer = { ...p, workDaysPerWeek: 4 };
    steps.push({
      kind: "structural",
      key: "fourDayWeek",
      categoryId: "work",
      hours: p.workDaysPerWeek - 4,
      gainPerDay: Math.max(0, ownTimePerDay(fewer) - ownTimePerDay(p)),
      effort: 5,
    });
  }
  const commute = CATEGORY_BY_ID.get("commute");
  if (commute && hoursOf(commute) > 0 && !p.during.commute) {
    const remote = { ...p, hours: { ...p.hours, commute: 0 } };
    steps.push({
      kind: "structural",
      key: "remote",
      categoryId: "commute",
      hours: hoursOf(commute),
      gainPerDay: Math.max(0, ownTimePerDay(remote) - ownTimePerDay(p)),
      effort: 4,
    });
  }

  return steps.filter((s) => s.gainPerDay > 0.001);
}

/** Fold a single step into a profile. The one place a step is interpreted. */
function applyStep(p: Profile, step: PlanStep): Profile {
  switch (step.kind) {
    case "overlap":
      if (!step.guestId) return p;
      return {
        ...p,
        during: {
          ...p.during,
          [step.categoryId]: { activity: step.guestId, hours: step.hours },
        },
      };
    case "cut":
      return {
        ...p,
        hours: {
          ...p.hours,
          [step.categoryId]: Math.max(0, (p.hours[step.categoryId] ?? 0) - step.hours),
        },
      };
    case "structural":
      if (step.key === "remote") return { ...p, hours: { ...p.hours, commute: 0 } };
      if (step.key === "fourDayWeek") return { ...p, workDaysPerWeek: 4 };
      return p;
  }
}

/**
 * Greedy by effort: cheapest sacrifice first.
 *
 * Each step's yield is measured against the profile as it stands when the step
 * is taken, not against the original. That distinction is the whole correctness
 * of this function. Moves are not independent -- "work from home" and "cut the
 * commute" free the same hour, and an overlap on a category that a later step
 * cuts to zero is worth nothing -- so summing yields computed up front
 * double-counts. An earlier version did exactly that and promised 14.1 hours a
 * day where applying the plan delivered 12.5.
 *
 * Measuring marginally also makes `achievedPerDay` exact by construction rather
 * than by estimate: it is read from the model after every step.
 */
export function buildPlan(p: Profile, targetPerDay: number): Plan {
  const currentPerDay = ownTimePerDay(p);
  const free: PlanStep[] = [];
  const costly: PlanStep[] = [];

  let working = p;
  let achieved = currentPerDay;

  const pool = candidates(p).sort(
    (a, b) => a.effort - b.effort || b.gainPerDay - a.gainPerDay,
  );

  for (const candidate of pool) {
    const need = targetPerDay - achieved;
    if (need <= 0.001) break;

    const full = applyStep(working, candidate);
    const fullGain = ownTimePerDay(full) - achieved;
    // Superseded by something already taken, so it now buys nothing.
    if (fullGain <= 0.001) continue;

    // Structural moves cannot be taken by halves; the rest are trimmed to what
    // the target actually needs, so nobody gives up two hours to gain twenty
    // minutes.
    let step = candidate;
    let next = full;
    if (candidate.kind !== "structural" && fullGain > need) {
      step = { ...candidate, hours: candidate.hours * (need / fullGain) };
      next = applyStep(working, step);
    }

    const gain = ownTimePerDay(next) - achieved;
    if (gain <= 0.001) continue;

    working = next;
    achieved += gain;
    (step.kind === "overlap" ? free : costly).push({ ...step, gainPerDay: gain });
  }

  // The loop only exits early once the target is met, so falling out of it
  // short means the pool was exhausted and the target is out of reach.
  return {
    currentPerDay,
    targetPerDay,
    free,
    costly,
    achievedPerDay: achieved,
    shortfallPerDay: Math.max(0, targetPerDay - achieved),
    reachable: achieved >= targetPerDay - 0.001,
  };
}

/**
 * Write a plan into a profile, so it can be inspected in the ledger rather than
 * sitting beside numbers it does not affect. Folds the same `applyStep` the
 * planner used, which is what keeps the promise and the result identical.
 */
export function applyPlan(p: Profile, plan: Plan): Profile {
  return [...plan.free, ...plan.costly].reduce(applyStep, p);
}
