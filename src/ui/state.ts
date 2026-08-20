/**
 * State lives in the URL hash, so a link is a complete record of someone's
 * numbers. Nothing is uploaded; there is no backend to upload it to.
 *
 * The encoding stays human-legible rather than base64 -- a shared link should
 * be inspectable by the person sharing it, given what it says about them.
 */

import {
  CATEGORIES,
  defaultBuckets,
  defaultHours,
  BUCKETS,
  DEFAULT_IMPROVEMENT,
  type Bucket,
  type HorizonBasis,
  type Overlap,
  type Profile,
  type Region,
  type Sex,
} from "../core/index.js";
import { LANGS, type Lang } from "./i18n.js";

export interface AppState {
  readonly lang: Lang;
  readonly profile: Profile;
}

const SCHEMA = 1;
const STORAGE_KEY = "kairos.state.v1";

const BUCKET_CODE: Record<Bucket, string> = { alive: "a", neutral: "n", leak: "l" };
const CODE_BUCKET: Record<string, Bucket> = { a: "alive", n: "neutral", l: "leak" };

const REGIONS: readonly Region[] = ["ru", "us", "de", "world"];
const SEXES: readonly Sex[] = ["male", "female"];
const BASES: readonly HorizonBasis[] = ["median", "mean", "p10", "p90"];

export function defaultProfile(): Profile {
  return {
    age: 25,
    sex: "male",
    region: "ru",
    improvement: DEFAULT_IMPROVEMENT,
    basis: "median",
    retirementAge: 65,
    workDaysPerWeek: 5,
    vacationDays: 28,
    hours: defaultHours(),
    buckets: defaultBuckets(),
    during: {},
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo;
}

function oneOf<T extends string>(v: string | null, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(v ?? "") ? (v as T) : fallback;
}

/**
 * Field separator inside a category triple.
 *
 * It must not be `.`, which is what this used to be: hours are fractional, so
 * `sleep.1.25.n` split into four parts and every shared link silently rounded
 * quarter-hours down to whole ones. `-` cannot occur in a category id and
 * cannot occur in a non-negative number, and URLSearchParams leaves it
 * unescaped.
 */
const SEP = "-";

export function encode(state: AppState): string {
  const p = state.profile;
  const cats = CATEGORIES.map((c) => {
    const h = p.hours[c.id] ?? c.defaultHours;
    const b = BUCKET_CODE[p.buckets[c.id] ?? c.defaultBucket];
    return [c.id, h, b].join(SEP);
  }).join("_");

  const during = Object.entries(p.during)
    .filter(([, o]) => o && o.hours > 0)
    .map(([host, o]) => [host, o.activity, o.hours].join(SEP))
    .join("_");

  const q = new URLSearchParams({
    v: String(SCHEMA),
    lang: state.lang,
    age: String(p.age),
    sex: p.sex,
    reg: p.region,
    bas: p.basis,
    ret: String(p.retirementAge),
    wd: String(p.workDaysPerWeek),
    vac: String(p.vacationDays),
    imp: p.improvement > 0 ? "1" : "0",
    c: cats,
    d: during,
  });
  return q.toString();
}

export function decode(raw: string, fallbackLang: Lang): AppState {
  const base = defaultProfile();
  const q = new URLSearchParams(raw.replace(/^#/, ""));
  if (q.get("v") !== String(SCHEMA)) {
    return { lang: fallbackLang, profile: base };
  }

  const hours: Record<string, number> = { ...base.hours };
  const buckets: Record<string, Bucket> = { ...base.buckets };
  for (const chunk of (q.get("c") ?? "").split("_")) {
    const [id, h, b] = chunk.split(SEP);
    const cat = CATEGORIES.find((c) => c.id === id);
    if (!cat) continue;
    hours[cat.id] = clamp(Number(h), 0, cat.max);
    if (b && b in CODE_BUCKET) buckets[cat.id] = CODE_BUCKET[b] as Bucket;
  }

  const during: Record<string, Overlap> = {};
  for (const chunk of (q.get("d") ?? "").split("_")) {
    const [host, activity, h] = chunk.split(SEP);
    const hostCat = CATEGORIES.find((c) => c.id === host && c.canHost);
    const guestCat = CATEGORIES.find((c) => c.id === activity && c.canOverlap);
    if (!hostCat || !guestCat) continue;
    const value = clamp(Number(h), 0, hostCat.max);
    if (value > 0) during[hostCat.id] = { activity: guestCat.id, hours: value };
  }

  const age = clamp(Number(q.get("age")), 1, 100);
  return {
    lang: oneOf(q.get("lang"), LANGS, fallbackLang),
    profile: {
      age,
      sex: oneOf(q.get("sex"), SEXES, base.sex),
      region: oneOf(q.get("reg"), REGIONS, base.region),
      basis: oneOf(q.get("bas"), BASES, base.basis),
      // Retiring before your current age is meaningless, so the floor tracks it.
      retirementAge: clamp(Number(q.get("ret")), age, 100),
      workDaysPerWeek: clamp(Number(q.get("wd")), 0, 7),
      vacationDays: clamp(Number(q.get("vac")), 0, 200),
      improvement: q.get("imp") === "0" ? 0 : DEFAULT_IMPROVEMENT,
      hours,
      buckets,
      during,
    },
  };
}

export function load(fallbackLang: Lang): AppState {
  if (location.hash.length > 1) return decode(location.hash, fallbackLang);
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return decode(saved, fallbackLang);
  } catch {
    // Private mode, disabled storage -- defaults are a fine outcome.
  }
  return { lang: fallbackLang, profile: defaultProfile() };
}

export function persist(state: AppState): void {
  const encoded = encode(state);
  // Both of these throw in a sandboxed iframe, and neither is load-bearing:
  // the app holds its own state in memory and persistence is a convenience.
  // Letting either failure escape would take the whole page down on a change.
  try {
    history.replaceState(null, "", "#" + encoded);
  } catch {
    // Sandboxed frame without same-origin access.
  }
  try {
    localStorage.setItem(STORAGE_KEY, encoded);
  } catch {
    // Storage disabled or full; the URL usually still holds the state.
  }
}

export { BUCKETS };
