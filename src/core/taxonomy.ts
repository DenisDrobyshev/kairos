/**
 * The category taxonomy is the contract between the calculator and the tracker.
 *
 * The calculator asks you to *estimate* hours per category. The tracker (see
 * `docs/tracker.md`) will *measure* them by pulling events from a local
 * ActivityWatch server and matching them with the `aw` field below. Both sides
 * must agree on the category ids or the two halves of the product cannot be
 * compared, which is the entire point -- the interesting number is the gap
 * between what you think you do and what you do.
 *
 * So: ids are stable and permanent. Renaming one is a breaking change.
 */

/**
 * How you account for an hour, which is a judgement the arithmetic cannot make
 * for you. The same hour of cooking is `alive` for one person and `neutral` for
 * another, and pretending otherwise is what makes most "time left" calculators
 * quietly dishonest -- they hard-code the author's values as if they were math.
 */
export type Bucket = "alive" | "neutral" | "leak";

export const BUCKETS: readonly Bucket[] = ["alive", "neutral", "leak"] as const;

/** What the entered number is "per". */
export type Cadence = "daily" | "workday" | "weekly";

/** Whether the category keeps accruing after you stop working. */
export type Phase = "always" | "working";

/** Matchers for ActivityWatch events. Ignored by the calculator. */
export interface AwMatcher {
  /** Regexes tested against the `app` field of aw-watcher-window events. */
  readonly apps?: readonly string[];
  /** Regexes tested against the `url` field of aw-watcher-web events. */
  readonly urls?: readonly string[];
  /** Regexes tested against the window `title` field. */
  readonly titles?: readonly string[];
  /**
   * True when the activity leaves no digital trace at all. The tracker must
   * never infer these from screen time; they stay user-estimated forever.
   */
  readonly offScreen?: boolean;
}

export interface Category {
  readonly id: string;
  readonly labels: { readonly ru: string; readonly en: string };
  readonly cadence: Cadence;
  readonly phase: Phase;
  readonly defaultHours: number;
  readonly defaultBucket: Bucket;
  readonly max: number;
  readonly step: number;
  readonly group: "given" | "obligation" | "upkeep" | "chosen";
  /**
   * Your hands are busy but your attention is not, so something else can run
   * on top of these hours: a commute, the washing up, a walk.
   */
  readonly canHost?: boolean;
  /** Can be the thing running on top: a podcast, a feed, a phone call. */
  readonly canOverlap?: boolean;
  /**
   * The largest share of this host a second activity can plausibly cover. You
   * can listen for the whole commute; you cannot spend every minute of dinner
   * on the phone. Without a cap the planner would "free" a whole day by
   * relabelling it, which is cheating dressed as optimisation.
   */
  readonly overlapCap?: number;
  /**
   * Which second activities actually fit this one, best first. Without it the
   * planner just picks your largest `alive` category and produces nonsense like
   * spending the train ride with friends.
   */
  readonly overlapPrefers?: readonly string[];
  /**
   * Hours below which cutting stops being a lifestyle change and starts being
   * a health problem. The planner never proposes going under this.
   */
  readonly floorHours?: number;
  /**
   * How much it costs you to give up an hour here, 1 (trivial) to 10 (do not).
   * Ordering the plan by this is what makes it a plan rather than a list.
   */
  readonly resistance?: number;
  readonly aw?: AwMatcher;
}

export const CATEGORIES: readonly Category[] = [
  {
    id: "sleep",
    labels: { ru: "Сон", en: "Sleep" },
    cadence: "daily",
    phase: "always",
    defaultHours: 8,
    defaultBucket: "neutral",
    max: 12,
    step: 0.25,
    floorHours: 7,
    resistance: 10,
    group: "given",
    aw: { offScreen: true },
  },
  {
    id: "work",
    labels: { ru: "Работа", en: "Work" },
    cadence: "workday",
    phase: "working",
    defaultHours: 8,
    defaultBucket: "neutral",
    max: 16,
    step: 0.5,
    resistance: 8,
    group: "obligation",
    aw: {
      apps: ["Code\.exe", "idea64", "Excel", "WINWORD", "Slack", "Teams", "Outlook"],
      urls: ["mail\.google\.com", "github\.com", "atlassian\.net", "notion\.so"],
    },
  },
  {
    id: "commute",
    labels: { ru: "Дорога", en: "Commute" },
    cadence: "workday",
    phase: "working",
    defaultHours: 1,
    defaultBucket: "leak",
    max: 5,
    step: 0.25,
    canHost: true,
    floorHours: 0,
    resistance: 3,
    overlapCap: 1.0,
    overlapPrefers: ["craft", "people", "video", "feeds"],
    group: "obligation",
    aw: { offScreen: true },
  },
  {
    id: "meals",
    labels: { ru: "Еда и готовка", en: "Eating and cooking" },
    cadence: "daily",
    phase: "always",
    defaultHours: 1.5,
    defaultBucket: "neutral",
    max: 6,
    step: 0.25,
    canHost: true,
    floorHours: 0.75,
    resistance: 6,
    overlapCap: 0.5,
    overlapPrefers: ["people", "video", "craft"],
    group: "upkeep",
    aw: { offScreen: true },
  },
  {
    id: "hygiene",
    labels: { ru: "Гигиена и туалет", en: "Hygiene and bathroom" },
    cadence: "daily",
    phase: "always",
    defaultHours: 1,
    defaultBucket: "neutral",
    max: 4,
    step: 0.25,
    floorHours: 0.5,
    resistance: 7,
    group: "upkeep",
    aw: { offScreen: true },
  },
  {
    id: "chores",
    labels: { ru: "Быт, уборка, покупки", en: "Chores, cleaning, errands" },
    cadence: "daily",
    phase: "always",
    defaultHours: 1.25,
    defaultBucket: "neutral",
    max: 6,
    step: 0.25,
    canHost: true,
    floorHours: 0.5,
    resistance: 4,
    overlapCap: 0.6,
    overlapPrefers: ["craft", "people", "video", "feeds"],
    group: "upkeep",
    aw: { offScreen: true },
  },
  {
    id: "admin",
    labels: { ru: "Бюрократия и деньги", en: "Admin and money" },
    cadence: "weekly",
    phase: "always",
    defaultHours: 2,
    defaultBucket: "neutral",
    max: 20,
    step: 0.5,
    floorHours: 0.5,
    resistance: 4,
    group: "upkeep",
    aw: {
      urls: ["gosuslugi\.ru", "nalog\.ru", "\bbank\b", "sberbank", "tinkoff"],
    },
  },
  {
    id: "feeds",
    labels: { ru: "Соцсети и ленты", en: "Social media and feeds" },
    cadence: "daily",
    phase: "always",
    defaultHours: 1.5,
    defaultBucket: "leak",
    max: 10,
    step: 0.25,
    canOverlap: true,
    floorHours: 0,
    resistance: 1,
    group: "chosen",
    aw: {
      apps: ["Telegram", "Discord", "Instagram"],
      urls: [
        "(^|\.)x\.com", "twitter\.com", "instagram\.com", "tiktok\.com",
        "vk\.com", "reddit\.com", "facebook\.com", "t\.me",
      ],
    },
  },
  {
    id: "video",
    labels: { ru: "Сериалы и видео", en: "Shows and video" },
    cadence: "daily",
    phase: "always",
    defaultHours: 1.25,
    defaultBucket: "leak",
    max: 10,
    step: 0.25,
    canOverlap: true,
    floorHours: 0,
    resistance: 1,
    group: "chosen",
    aw: {
      apps: ["vlc", "mpv", "Netflix"],
      urls: ["youtube\.com", "netflix\.com", "kinopoisk\.ru", "twitch\.tv"],
    },
  },
  {
    id: "games",
    labels: { ru: "Игры", en: "Games" },
    cadence: "daily",
    phase: "always",
    defaultHours: 0.25,
    defaultBucket: "leak",
    max: 10,
    step: 0.25,
    floorHours: 0,
    resistance: 2,
    group: "chosen",
    aw: { apps: ["steam", "Steam\.exe", "EpicGames", "battle\.net"] },
  },
  {
    id: "people",
    labels: { ru: "Близкие и друзья", en: "Family and friends" },
    cadence: "daily",
    phase: "always",
    defaultHours: 1.0,
    defaultBucket: "alive",
    max: 12,
    step: 0.25,
    canOverlap: true,
    resistance: 9,
    group: "chosen",
    aw: { offScreen: true },
  },
  {
    id: "body",
    labels: { ru: "Спорт и движение", en: "Exercise" },
    cadence: "daily",
    phase: "always",
    defaultHours: 0.5,
    defaultBucket: "alive",
    max: 6,
    step: 0.25,
    canHost: true,
    resistance: 9,
    overlapCap: 0.7,
    overlapPrefers: ["craft", "people", "feeds"],
    group: "chosen",
    aw: { offScreen: true },
  },
  {
    id: "craft",
    labels: { ru: "Учёба и своё дело", en: "Learning and own projects" },
    cadence: "daily",
    phase: "always",
    defaultHours: 0.75,
    defaultBucket: "alive",
    max: 12,
    step: 0.25,
    canOverlap: true,
    resistance: 9,
    group: "chosen",
    aw: {
      apps: ["Code\.exe", "idea64", "Obsidian", "Anki"],
      urls: ["github\.com", "arxiv\.org", "coursera\.org", "stackoverflow\.com"],
    },
  },
] as const;

export const CATEGORY_BY_ID: ReadonlyMap<string, Category> = new Map(
  CATEGORIES.map((c) => [c.id, c]),
);

export function defaultHours(): Record<string, number> {
  return Object.fromEntries(CATEGORIES.map((c) => [c.id, c.defaultHours]));
}

export function defaultBuckets(): Record<string, Bucket> {
  return Object.fromEntries(CATEGORIES.map((c) => [c.id, c.defaultBucket]));
}
