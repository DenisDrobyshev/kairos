import { describe, expect, it } from "vitest";
import {
  POPULATIONS,
  FIT_MAX_ERROR_YEARS,
  DEFAULT_IMPROVEMENT,
  lifeExpectancy,
  survival,
  quantileAge,
  computeLedger,
  levers,
  dailyHourValue,
  defaultHours,
  defaultBuckets,
  DAYS_PER_YEAR,
  HOURS_PER_YEAR,
  type PopulationKey,
  type Profile,
} from "../src/core/index.js";
import who from "./fixtures/who-reference.json" with { type: "json" };

/**
 * The model is only worth shipping if it reproduces the real life tables it was
 * fitted to. This checks every adult age WHO publishes, for every population,
 * against the figures captured at generation time -- so a bad refit fails here
 * rather than quietly shifting the numbers users read.
 */
describe("mortality against WHO life tables", () => {
  const entries = Object.entries(who.populations) as Array<
    [PopulationKey, { ex: Record<string, number>; maxError: number }]
  >;

  /**
   * The generator integrates with trapezoids and this module with Simpson's
   * rule, so the two disagree in the fourth decimal of a year. Four days of
   * slack on a life-expectancy figure is far below anything a reader could act
   * on, and still tight enough to catch a genuinely bad refit.
   */
  const QUADRATURE_SLACK = 0.01;

  it.each(entries)("%s reproduces published life expectancy", (key, ref) => {
    const p = POPULATIONS[key];
    for (const [age, published] of Object.entries(ref.ex)) {
      // Period table: no cohort improvement, matching how WHO computed it.
      const modelled = lifeExpectancy(Number(age), p, 0);
      expect(Math.abs(modelled - published)).toBeLessThanOrEqual(
        FIT_MAX_ERROR_YEARS + QUADRATURE_SLACK,
      );
    }
  });

  it("keeps the published fit error small enough to be worth quoting", () => {
    expect(FIT_MAX_ERROR_YEARS).toBeLessThan(0.5);
  });
});

describe("mortality", () => {

  it("survives the present moment with certainty", () => {
    expect(survival(22, 0, POPULATIONS.ru_male)).toBe(1);
  });

  it("decays monotonically", () => {
    const p = POPULATIONS.ru_male;
    let prev = 1;
    for (let t = 1; t <= 80; t++) {
      const s = survival(22, t, p);
      expect(s).toBeLessThan(prev);
      prev = s;
    }
  });

  it("orders quantiles", () => {
    const p = POPULATIONS.ru_male;
    const q10 = quantileAge(22, 0.1, p);
    const q50 = quantileAge(22, 0.5, p);
    const q90 = quantileAge(22, 0.9, p);
    expect(q10).toBeLessThan(q50);
    expect(q50).toBeLessThan(q90);
    expect(q10).toBeGreaterThan(22);
  });

  it("agrees with its own survival curve at the median", () => {
    const p = POPULATIONS.us_female;
    const median = quantileAge(30, 0.5, p);
    expect(survival(30, median - 30, p)).toBeCloseTo(0.5, 6);
  });

  it("treats cohort improvement as strictly good news", () => {
    const p = POPULATIONS.ru_male;
    const period = lifeExpectancy(22, p, 0);
    const cohort = lifeExpectancy(22, p, DEFAULT_IMPROVEMENT);
    expect(cohort).toBeGreaterThan(period);
    // A 1%/yr improvement is worth a few years to a 22-year-old, not decades.
    expect(cohort - period).toBeGreaterThan(2);
    expect(cohort - period).toBeLessThan(12);
  });

  /**
   * On a period table, surviving longer can only improve your outlook: every
   * extra year you are alive is a year of hazard you did not die of. If this
   * ever fails, the conditioning in `cumulativeHazard` is wrong.
   */
  it("raises the period median monotonically with age", () => {
    const p = POPULATIONS.ru_male;
    let previous = -Infinity;
    for (let age = 20; age <= 85; age++) {
      const median = quantileAge(age, 0.5, p, 0);
      expect(median).toBeGreaterThan(previous);
      expect(median).toBeGreaterThan(age);
      previous = median;
    }
  });

  /**
   * The cohort median is *not* monotone, and that is correct rather than a bug.
   * A 20-year-old reaches 70 in fifty years and collects fifty years of
   * mortality improvement on the way; a 40-year-old collects thirty. So the
   * younger cohort can show a later median death age than the older one, and
   * the curve dips through midlife before survivorship takes over again.
   *
   * This is pinned deliberately: it looks like a defect to anyone comparing two
   * ages, and a future "fix" would break the model rather than repair it.
   */
  it("lets the cohort median dip through midlife, and never fall below period", () => {
    const p = POPULATIONS.ru_male;
    const at = (age: number) => quantileAge(age, 0.5, p, DEFAULT_IMPROVEMENT);
    expect(at(40)).toBeLessThan(at(20));
    expect(at(60)).toBeGreaterThan(at(40));
    for (let age = 20; age <= 85; age += 5) {
      expect(at(age)).toBeGreaterThanOrEqual(quantileAge(age, 0.5, p, 0));
    }
  });

  it("keeps the improvement term stable at the r == C singularity", () => {
    const p = POPULATIONS.ru_male;
    const at = lifeExpectancy(22, p, p.C);
    const just = lifeExpectancy(22, p, p.C + 1e-12);
    expect(Number.isFinite(at)).toBe(true);
    expect(at).toBeCloseTo(just, 6);
  });
});

/** The profile from the conversation that started this project. */
function baseProfile(over: Partial<Profile> = {}): Profile {
  return {
    age: 22,
    sex: "male",
    region: "ru",
    improvement: DEFAULT_IMPROVEMENT,
    basis: "median",
    retirementAge: 65,
    workDaysPerWeek: 5,
    vacationDays: 28,
    hours: defaultHours(),
    buckets: defaultBuckets(),
    ...over,
  };
}

describe("ledger", () => {
  it("conserves hours across buckets and the remainder", () => {
    const l = computeLedger(baseProfile());
    const sum = l.byBucket.alive + l.byBucket.neutral + l.byBucket.leak;
    expect(sum + l.unallocatedHours).toBeCloseTo(l.totalHours, 6);
  });

  it("never lets a category outlive the horizon", () => {
    const l = computeLedger(baseProfile());
    for (const row of l.rows) {
      expect(row.activeYears).toBeLessThanOrEqual(l.remainingYears + 1e-9);
    }
  });

  it("stops charging for work after retirement", () => {
    const l = computeLedger(baseProfile({ retirementAge: 40 }));
    const work = l.rows.find((r) => r.category.id === "work")!;
    expect(work.activeYears).toBeCloseTo(18, 6);
  });

  it("does not charge for work at all if retirement already happened", () => {
    const l = computeLedger(baseProfile({ age: 70, retirementAge: 65 }));
    const work = l.rows.find((r) => r.category.id === "work")!;
    expect(work.totalHours).toBe(0);
  });

  it("flags an impossible day instead of returning a negative remainder", () => {
    const hours = { ...defaultHours(), feeds: 10, video: 10, games: 10 };
    const l = computeLedger(baseProfile({ hours }));
    expect(l.overcommitted).toBe(true);
    expect(l.committedHoursPerDay).toBeGreaterThan(24);
  });

  it("reports a plausible committed day for the defaults", () => {
    const l = computeLedger(baseProfile());
    expect(l.committedHoursPerDay).toBeGreaterThan(18);
    expect(l.committedHoursPerDay).toBeLessThan(24);
  });

  /**
   * Regression test for the arithmetic bug this project was built to correct.
   *
   * The original hand calculation mixed units -- it subtracted "hours per day"
   * from a quantity already expressed in post-sleep days -- and arrived at
   * 4,902 hours of discretionary life. The honest figure, under the same harsh
   * assumptions, is over an order of magnitude larger. If this assertion ever
   * fails, the unit confusion has crept back in.
   */
  it("does not collapse discretionary time by an order of magnitude", () => {
    const harsh = {
      ...defaultHours(),
      feeds: 2, video: 2, games: 0, people: 0, body: 0, craft: 0,
    };
    const l = computeLedger(baseProfile({ hours: harsh, improvement: 0 }));
    expect(l.unallocatedHours).toBeGreaterThan(40_000);
    expect(l.unallocatedHours).toBeLessThan(200_000);
  });
});

describe("levers", () => {
  it("prices one daily hour at one day per day of horizon", () => {
    const p = baseProfile();
    const l = computeLedger(p);
    expect(dailyHourValue(l)).toBeCloseTo(l.remainingYears * DAYS_PER_YEAR, 6);
  });

  it("matches a manual recomputation of cutting an hour of feeds", () => {
    const p = baseProfile();
    const before = computeLedger(p);
    const after = computeLedger({
      ...p,
      hours: { ...p.hours, feeds: (p.hours.feeds ?? 0) - 1 },
    });
    const freed = after.unallocatedHours - before.unallocatedHours;
    const lever = levers(p).find((x) => x.id === "cut:feeds")!;
    expect(lever.deltaHours).toBeCloseTo(freed, 6);
  });

  it("ranks structural change above a single daily habit", () => {
    const ranked = levers(baseProfile());
    const retire = ranked.findIndex((l) => l.id === "retireEarly");
    const games = ranked.findIndex((l) => l.id === "cut:games");
    expect(retire).toBeGreaterThanOrEqual(0);
    expect(retire).toBeLessThan(games);
  });

  it("keeps every lever within the horizon it is drawn from", () => {
    const l = computeLedger(baseProfile());
    for (const lever of levers(baseProfile())) {
      expect(Math.abs(lever.deltaHours)).toBeLessThan(l.totalHours);
    }
  });

  it("offers no commute lever worth counting when already remote", () => {
    const p = baseProfile({ hours: { ...defaultHours(), commute: 0 } });
    expect(levers(p).find((l) => l.id === "remote")).toBeUndefined();
  });
});

describe("units", () => {
  it("keeps a year of hours consistent with the calendar", () => {
    expect(HOURS_PER_YEAR).toBeCloseTo(8766, 0);
    expect(DAYS_PER_YEAR).toBeCloseTo(365.2425, 6);
  });
});
