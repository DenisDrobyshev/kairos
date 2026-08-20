/**
 * Formatting is where a calculator like this usually starts lying.
 *
 * Two rules hold throughout. Large counts are rounded to a precision the model
 * can actually support -- quoting 74,622 hours implies an accuracy that a
 * distribution 35 years wide does not have. And hours are never re-expressed as
 * "days" unless they really are whole days; post-sleep remainders get labelled
 * as waking days so the unit is visible.
 */

import { HOURS_PER_YEAR } from "../core/index.js";
import { t, type Lang } from "./i18n.js";

const LOCALE: Record<Lang, string> = { ru: "ru-RU", en: "en-US" };

export function num(lang: Lang, value: number, digits = 0): string {
  return new Intl.NumberFormat(LOCALE[lang], {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

/**
 * Rounds to three significant figures before grouping. A number this size is an
 * estimate, and printing every digit of an estimate is a form of dishonesty.
 */
export function bigCount(lang: Lang, value: number): string {
  const v = Math.abs(value);
  if (v < 1000) return num(lang, Math.round(value));
  const magnitude = Math.pow(10, Math.floor(Math.log10(v)) - 2);
  return num(lang, Math.round(value / magnitude) * magnitude);
}

export function hours(lang: Lang, value: number): string {
  return `${bigCount(lang, value)} ${t(lang, "unit.hours")}`;
}

export function years(lang: Lang, value: number, digits = 1): string {
  return `${num(lang, value, digits)} ${t(lang, "unit.years")}`;
}

/** Hours as a span of years, for quantities large enough that years read better. */
export function hoursAsYears(lang: Lang, value: number): string {
  return years(lang, value / HOURS_PER_YEAR);
}

export function percent(lang: Lang, fraction: number): string {
  return `${num(lang, fraction * 100, fraction < 0.01 ? 1 : 0)}%`;
}

/** Age with one decimal, since a horizon of 70.6 is not the same claim as 70. */
export function age(lang: Lang, value: number): string {
  return num(lang, value, 1);
}

export function signedHours(lang: Lang, value: number): string {
  return (value >= 0 ? "+" : "−") + hours(lang, Math.abs(value));
}
