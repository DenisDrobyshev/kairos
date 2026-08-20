/**
 * Mortality model: Gompertz–Makeham with an optional cohort-improvement term.
 *
 *   mu(x, s) = (A + B * exp(C * x)) * exp(-r * s)
 *
 * where `x` is attained age, `s` is years from today, and `r` is the annual rate
 * at which age-specific mortality improves. Setting r = 0 gives a *period* table
 * (today's rates frozen forever); r > 0 gives a *cohort* projection.
 *
 * This distinction is not cosmetic. Published "life expectancy" figures are
 * almost always period figures, and for someone in their twenties they
 * understate the median death age by several years. A calculator that shows you
 * a countdown owes you the honest version of the number, so both are exposed.
 *
 * Parameters live in `populations.ts` and are generated, not written: they are
 * fitted to WHO Global Health Observatory life tables by `tools/fit_mortality.py`.
 * See `docs/mortality.md` for the method and its limits.
 */

export interface MortalityParams {
  /** Makeham term: age-independent background hazard (accidents, violence). */
  readonly A: number;
  /** Gompertz scale: senescent hazard at age 0. */
  readonly B: number;
  /** Gompertz rate: how fast senescent hazard compounds, per year. */
  readonly C: number;
}

export type Sex = "male" | "female";
export type Region = "ru" | "us" | "de" | "world";
export type PopulationKey = `${Region}_${Sex}`;

export { POPULATIONS, WHO_YEAR, FIT_MAX_ERROR_YEARS } from "./populations.js";

/**
 * Observed annual improvement in age-specific mortality in developed countries
 * has run roughly 1--2% per year over the past half-century, with long
 * plateaus and reversals (Russia in the 1990s, most countries in 2020--21).
 * 1.0%/yr is a deliberately conservative default: it is at the low end of the
 * historical range, so the projection errs toward less time rather than more.
 */
export const DEFAULT_IMPROVEMENT = 0.01;

export const MAX_AGE = 125;

/** Numerically safe (e^z - 1) / z, including the removable singularity at z = 0. */
function expm1Over(z: number): number {
  return Math.abs(z) < 1e-9 ? 1 + z / 2 : Math.expm1(z) / z;
}

/**
 * Cumulative hazard accumulated between `age` and `age + years`.
 *
 * Closed form of the integral of mu; no quadrature, so quantiles stay exact
 * and cheap enough to recompute on every slider drag.
 */
export function cumulativeHazard(
  age: number,
  years: number,
  p: MortalityParams,
  improvement = 0,
): number {
  if (years <= 0) return 0;
  const makeham = p.A * years * expm1Over(-improvement * years);
  const gompertz =
    (p.B * Math.exp(p.C * age) * years) * expm1Over((p.C - improvement) * years);
  return makeham + gompertz;
}

/** Probability of surviving `years` more, given you are alive at `age`. */
export function survival(
  age: number,
  years: number,
  p: MortalityParams,
  improvement = 0,
): number {
  return Math.exp(-cumulativeHazard(age, years, p, improvement));
}

/**
 * Remaining life expectancy at `age`, i.e. the integral of the conditional
 * survival curve. Simpson's rule on a fine grid; error is far below the
 * uncertainty in the inputs.
 */
export function lifeExpectancy(
  age: number,
  p: MortalityParams,
  improvement = 0,
): number {
  const span = MAX_AGE - age;
  if (span <= 0) return 0;
  const n = 4096; // even, so Simpson's rule applies cleanly
  const h = span / n;
  let acc = 0;
  for (let i = 0; i <= n; i++) {
    const w = i === 0 || i === n ? 1 : i % 2 === 1 ? 4 : 2;
    acc += w * survival(age, i * h, p, improvement);
  }
  return (acc * h) / 3;
}

/**
 * Age by which a fraction `q` of people alive at `age` have died.
 *
 * `quantileAge(22, 0.5, ...)` is the median death age -- the number most people
 * mean when they ask how long they have, and a more honest headline than the
 * mean, because the distribution is left-skewed.
 */
export function quantileAge(
  age: number,
  q: number,
  p: MortalityParams,
  improvement = 0,
): number {
  if (q <= 0) return age;
  if (q >= 1) return MAX_AGE;
  const target = -Math.log1p(-q);
  // Hazard is strictly increasing in `years`, so plain bisection is robust and
  // needs no derivative or bracketing heuristics.
  let lo = 0;
  let hi = MAX_AGE - age;
  if (cumulativeHazard(age, hi, p, improvement) < target) return MAX_AGE;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (cumulativeHazard(age, mid, p, improvement) < target) lo = mid;
    else hi = mid;
  }
  return age + (lo + hi) / 2;
}

export interface Horizon {
  /** Mean remaining years. */
  readonly expectancy: number;
  /** Age at which 50% of your cohort has died. */
  readonly medianAge: number;
  /** Age by which 10% have died -- the unlucky tail. */
  readonly p10Age: number;
  /** Age by which 90% have died -- the lucky tail. */
  readonly p90Age: number;
  /** Probability of reaching common milestones, keyed by age. */
  readonly reaching: ReadonlyMap<number, number>;
}

const MILESTONES = [30, 40, 50, 60, 65, 70, 80, 90, 100] as const;

export function horizon(
  age: number,
  p: MortalityParams,
  improvement = DEFAULT_IMPROVEMENT,
): Horizon {
  const reaching = new Map<number, number>();
  for (const m of MILESTONES) {
    if (m > age) reaching.set(m, survival(age, m - age, p, improvement));
  }
  return {
    expectancy: lifeExpectancy(age, p, improvement),
    medianAge: quantileAge(age, 0.5, p, improvement),
    p10Age: quantileAge(age, 0.1, p, improvement),
    p90Age: quantileAge(age, 0.9, p, improvement),
    reaching,
  };
}

export function populationKey(region: Region, sex: Sex): PopulationKey {
  return `${region}_${sex}`;
}
