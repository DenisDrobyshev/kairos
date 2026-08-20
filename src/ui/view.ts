/**
 * The view builds its DOM once and then mutates it.
 *
 * A naive innerHTML re-render on every change would drop focus mid-drag and
 * rebuild five thousand week cells sixty times a second. Instead the skeleton is
 * constructed at mount, refs are captured, and `update` writes only what
 * changed -- with the week grid guarded behind a signature, since it depends on
 * age and horizon but not on how you spend your Tuesday.
 */

import {
  CATEGORIES,
  BUCKETS,
  computeLedger,
  levers,
  dailyHourValue,
  hoursToYears,
  FIT_MAX_ERROR_YEARS,
  WHO_YEAR,
  type Bucket,
  type Category,
  type HorizonBasis,
  type Profile,
  type Region,
  type Sex,
} from "../core/index.js";
import { t, LANGS, type Lang } from "./i18n.js";
import type { AppState } from "./state.js";
import { age as fmtAge, bigCount, hours, hoursAsYears, num, percent, years } from "./format.js";

export interface ViewCallbacks {
  onProfile(patch: Partial<Profile>): void;
  onLang(lang: Lang): void;
  onReset(): void;
  onShare(): Promise<void> | void;
}

/** Weeks drawn in the memento-mori grid. Beyond this nobody is budgeting. */
const GRID_YEARS = 95;
const WEEKS_PER_ROW = 52;

type El = HTMLElement;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) node.append(c);
  return node;
}

function field(labelEl: El, control: El, hint?: El): El {
  return el("div", { class: "field" }, hint ? [labelEl, control, hint] : [labelEl, control]);
}

export function mount(root: El, cb: ViewCallbacks): (s: AppState) => void {
  root.textContent = "";

  // ---- header -------------------------------------------------------------
  const tagline = el("p", { class: "tagline" });
  const lede = el("p", { class: "lede" });
  const langBox = el("div", { class: "langs" });
  const langButtons = new Map<Lang, HTMLButtonElement>();
  for (const l of LANGS) {
    const b = el("button", { type: "button", class: "lang" }, [l.toUpperCase()]);
    b.addEventListener("click", () => cb.onLang(l));
    langButtons.set(l, b);
    langBox.append(b);
  }
  root.append(
    el("header", {}, [
      el("div", { class: "brand" }, [el("h1", {}, ["kairos"]), langBox]),
      tagline,
      lede,
    ]),
  );

  const main = el("main");
  root.append(main);

  // ---- section: you -------------------------------------------------------
  const youTitle = el("h2");
  const ageInput = el("input", { type: "number", min: "1", max: "100", step: "1", id: "f-age" });
  const ageLabel = el("label", { for: "f-age" });
  const sexSelect = el("select", { id: "f-sex" });
  const sexLabel = el("label", { for: "f-sex" });
  const regionSelect = el("select", { id: "f-reg" });
  const regionLabel = el("label", { for: "f-reg" });
  const retireInput = el("input", { type: "number", min: "0", max: "100", step: "1", id: "f-ret" });
  const retireLabel = el("label", { for: "f-ret" });
  const workDaysInput = el("input", { type: "number", min: "0", max: "7", step: "1", id: "f-wd" });
  const workDaysLabel = el("label", { for: "f-wd" });
  const vacationInput = el("input", { type: "number", min: "0", max: "200", step: "1", id: "f-vac" });
  const vacationLabel = el("label", { for: "f-vac" });
  const basisSelect = el("select", { id: "f-bas" });
  const basisLabel = el("label", { for: "f-bas" });
  const improveInput = el("input", { type: "checkbox", id: "f-imp" });
  const improveLabel = el("label", { for: "f-imp" });
  const improveHint = el("p", { class: "hint" });

  ageInput.addEventListener("input", () => cb.onProfile({ age: Number(ageInput.value) }));
  retireInput.addEventListener("input", () =>
    cb.onProfile({ retirementAge: Number(retireInput.value) }),
  );
  workDaysInput.addEventListener("input", () =>
    cb.onProfile({ workDaysPerWeek: Number(workDaysInput.value) }),
  );
  vacationInput.addEventListener("input", () =>
    cb.onProfile({ vacationDays: Number(vacationInput.value) }),
  );
  sexSelect.addEventListener("change", () => cb.onProfile({ sex: sexSelect.value as Sex }));
  regionSelect.addEventListener("change", () =>
    cb.onProfile({ region: regionSelect.value as Region }),
  );
  basisSelect.addEventListener("change", () =>
    cb.onProfile({ basis: basisSelect.value as HorizonBasis }),
  );
  improveInput.addEventListener("change", () =>
    cb.onProfile({ improvement: improveInput.checked ? 0.01 : 0 }),
  );

  main.append(
    el("section", { class: "card" }, [
      youTitle,
      el("div", { class: "grid-fields" }, [
        field(ageLabel, ageInput),
        field(sexLabel, sexSelect),
        field(regionLabel, regionSelect),
        field(retireLabel, retireInput),
        field(workDaysLabel, workDaysInput),
        field(vacationLabel, vacationInput),
        field(basisLabel, basisSelect),
      ]),
      el("div", { class: "toggle-row" }, [improveInput, improveLabel]),
      improveHint,
    ]),
  );

  // ---- section: horizon ---------------------------------------------------
  const horizonTitle = el("h2");
  const medianLead = el("p", { class: "lead-line" });
  const medianBig = el("p", { class: "figure" });
  const rangeLine = el("p", { class: "range-line" });
  const remainingLine = el("p", { class: "range-line" });
  const periodNote = el("p", { class: "hint" });
  main.append(
    el("section", { class: "card horizon" }, [
      horizonTitle, medianLead, medianBig, rangeLine, remainingLine, periodNote,
    ]),
  );

  // ---- section: weeks -----------------------------------------------------
  const weeksTitle = el("h2");
  const weeksLegend = el("div", { class: "legend" });
  const weeksCaption = el("p", { class: "hint" });
  const weeksGrid = el("div", { class: "weeks" });
  const cells: HTMLSpanElement[] = [];
  for (let y = 0; y < GRID_YEARS; y++) {
    const row = el("div", { class: "week-row" });
    for (let w = 0; w < WEEKS_PER_ROW; w++) {
      const cell = el("span", { class: "week" });
      cells.push(cell);
      row.append(cell);
    }
    weeksGrid.append(row);
  }
  main.append(
    el("section", { class: "card" }, [weeksTitle, weeksLegend, weeksGrid, weeksCaption]),
  );

  // ---- section: your day --------------------------------------------------
  const dayTitle = el("h2");
  const dayHint = el("p", { class: "hint" });
  const bucketHint = el("p", { class: "hint" });
  const dayWarning = el("p", { class: "warning", hidden: "" });
  const dayMeter = el("div", { class: "meter" });
  const dayMeterFill = el("div", { class: "meter-fill" });
  dayMeter.append(dayMeterFill);
  const dayMeterLabel = el("p", { class: "meter-label" });

  interface Row {
    readonly slider: HTMLInputElement;
    readonly readout: El;
    readonly label: El;
    readonly cadence: El;
    readonly buttons: Map<Bucket, HTMLButtonElement>;
  }
  const rows = new Map<string, Row>();
  const dayBody = el("div", { class: "categories" });

  const groups: Category["group"][] = ["given", "obligation", "upkeep", "chosen"];
  const groupTitles = new Map<string, El>();
  for (const g of groups) {
    const heading = el("h3", { class: "group" });
    groupTitles.set(g, heading);
    dayBody.append(heading);
    for (const cat of CATEGORIES.filter((c) => c.group === g)) {
      const label = el("span", { class: "cat-name" });
      const readout = el("span", { class: "cat-value" });
      const cadence = el("span", { class: "cat-cadence" });
      const slider = el("input", {
        type: "range", min: "0", max: String(cat.max), step: String(cat.step),
        "aria-label": cat.labels.en,
      });
      slider.addEventListener("input", () =>
        cb.onProfile({ hours: { [cat.id]: Number(slider.value) } as Record<string, number> }),
      );

      const seg = el("div", { class: "segmented" });
      const buttons = new Map<Bucket, HTMLButtonElement>();
      for (const b of BUCKETS) {
        const btn = el("button", { type: "button", class: `seg seg-${b}` });
        btn.addEventListener("click", () =>
          cb.onProfile({ buckets: { [cat.id]: b } as Record<string, Bucket> }),
        );
        buttons.set(b, btn);
        seg.append(btn);
      }

      dayBody.append(
        el("div", { class: "cat-row" }, [
          el("div", { class: "cat-head" }, [label, readout, cadence]),
          slider,
          seg,
        ]),
      );
      rows.set(cat.id, { slider, readout, label, cadence, buttons });
    }
  }

  main.append(
    el("section", { class: "card" }, [
      dayTitle, dayHint, dayMeter, dayMeterLabel, dayWarning, bucketHint, dayBody,
    ]),
  );

  // ---- section: ledger ----------------------------------------------------
  const ledgerTitle = el("h2");
  const bucketBar = el("div", { class: "bucket-bar" });
  const bucketSegs = new Map<string, HTMLDivElement>();
  for (const k of ["alive", "neutral", "leak", "unallocated"]) {
    const seg = el("div", { class: `bucket-seg bucket-${k}` });
    bucketSegs.set(k, seg);
    bucketBar.append(seg);
  }
  const bucketLegend = el("div", { class: "legend" });
  const ledgerBody = el("div", { class: "ledger" });
  main.append(
    el("section", { class: "card" }, [ledgerTitle, bucketBar, bucketLegend, ledgerBody]),
  );

  // ---- section: levers ----------------------------------------------------
  const leversTitle = el("h2");
  const leversHint = el("p", { class: "hint" });
  const exchangeLine = el("p", { class: "exchange" });
  const leversBody = el("div", { class: "levers" });
  main.append(
    el("section", { class: "card" }, [leversTitle, leversHint, exchangeLine, leversBody]),
  );

  // ---- section: method ----------------------------------------------------
  const methodTitle = el("h2");
  const methodSource = el("p");
  const methodUnits = el("p");
  const methodDist = el("p");
  const methodPrivacy = el("p");
  const shareBtn = el("button", { type: "button", class: "action" });
  const resetBtn = el("button", { type: "button", class: "action ghost" });
  shareBtn.addEventListener("click", () => void cb.onShare());
  resetBtn.addEventListener("click", () => cb.onReset());
  main.append(
    el("section", { class: "card method" }, [
      methodTitle, methodSource, methodUnits, methodDist, methodPrivacy,
      el("div", { class: "actions" }, [shareBtn, resetBtn]),
    ]),
  );

  // ---- update -------------------------------------------------------------
  let gridSignature = "";
  let focused: Element | null = null;

  function setOptions(
    select: HTMLSelectElement, lang: Lang, values: readonly string[], prefix: string, current: string,
  ): void {
    const wanted = values.map((v) => `${v}:${t(lang, prefix + v)}`).join("|");
    if (select.dataset.built !== wanted) {
      select.textContent = "";
      for (const v of values) {
        select.append(el("option", { value: v }, [t(lang, prefix + v)]));
      }
      select.dataset.built = wanted;
    }
    select.value = current;
  }

  return function update(state: AppState): void {
    const { lang, profile } = state;
    const ledger = computeLedger(profile);
    focused = document.activeElement;

    document.documentElement.lang = lang;
    tagline.textContent = t(lang, "app.tagline");
    lede.textContent = t(lang, "app.lede");
    for (const [l, b] of langButtons) b.classList.toggle("on", l === lang);

    // you
    youTitle.textContent = t(lang, "nav.you");
    ageLabel.textContent = t(lang, "you.age");
    sexLabel.textContent = t(lang, "you.sex");
    regionLabel.textContent = t(lang, "you.region");
    retireLabel.textContent = t(lang, "you.retirement");
    workDaysLabel.textContent = t(lang, "you.workDays");
    vacationLabel.textContent = t(lang, "you.vacation");
    basisLabel.textContent = t(lang, "horizon.basis");
    improveLabel.textContent = t(lang, "horizon.improvement");
    improveHint.textContent = t(lang, "horizon.improvement.hint");
    if (focused !== ageInput) ageInput.value = String(profile.age);
    if (focused !== retireInput) retireInput.value = String(profile.retirementAge);
    if (focused !== workDaysInput) workDaysInput.value = String(profile.workDaysPerWeek);
    if (focused !== vacationInput) vacationInput.value = String(profile.vacationDays);
    improveInput.checked = profile.improvement > 0;
    setOptions(sexSelect, lang, ["male", "female"], "you.sex.", profile.sex);
    setOptions(regionSelect, lang, ["ru", "us", "de", "world"], "you.region.", profile.region);
    setOptions(basisSelect, lang, ["median", "mean", "p10", "p90"], "horizon.basis.", profile.basis);

    // horizon
    const h = ledger.horizon;
    horizonTitle.textContent = t(lang, "horizon.title");
    medianLead.textContent = t(lang, "horizon.median");
    medianBig.textContent = fmtAge(lang, h.medianAge);
    rangeLine.textContent =
      `${t(lang, "horizon.range")} ${fmtAge(lang, h.p10Age)} ${t(lang, "horizon.and")} ${fmtAge(lang, h.p90Age)}`;
    remainingLine.textContent =
      `${t(lang, "horizon.remaining")}: ${years(lang, ledger.remainingYears)} · ` +
      `${bigCount(lang, ledger.totalHours)} ${t(lang, "horizon.hours")}`;
    periodNote.hidden = profile.improvement === 0;
    if (profile.improvement > 0) {
      const period = computeLedger({ ...profile, improvement: 0 });
      periodNote.textContent =
        `${t(lang, "horizon.period")} ${years(lang, ledger.remainingYears - period.remainingYears)}`;
    }

    // weeks -- rebuilt only when the horizon actually moves
    weeksTitle.textContent = t(lang, "weeks.title");
    weeksCaption.textContent = t(lang, "weeks.caption");
    const sig = `${profile.age}|${h.medianAge.toFixed(2)}|${h.p90Age.toFixed(2)}`;
    if (sig !== gridSignature) {
      gridSignature = sig;
      const lived = Math.round(profile.age * WEEKS_PER_ROW);
      const median = Math.round(h.medianAge * WEEKS_PER_ROW);
      const late = Math.round(h.p90Age * WEEKS_PER_ROW);
      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i]!;
        cell.className =
          i < lived ? "week lived"
          : i < median ? "week left"
          : i < late ? "week bonus"
          : "week beyond";
      }
    }
    weeksLegend.textContent = "";
    for (const [cls, key] of [["lived", "weeks.lived"], ["left", "weeks.left"], ["bonus", "weeks.bonus"]] as const) {
      // A legend swatch is not a week, and must not answer to `.week` -- the
      // grid is counted and addressed by that selector.
      weeksLegend.append(
        el("span", { class: "legend-item" }, [
          el("span", { class: `swatch swatch-${cls}` }),
          t(lang, key),
        ]),
      );
    }

    // your day
    dayTitle.textContent = t(lang, "day.title");
    dayHint.textContent = t(lang, "day.hint");
    bucketHint.textContent = t(lang, "bucket.hint");
    for (const g of groups) groupTitles.get(g)!.textContent = t(lang, `group.${g}`);
    dayMeterFill.style.width = `${Math.min(100, (ledger.committedHoursPerDay / 24) * 100)}%`;
    dayMeterFill.classList.toggle("over", ledger.overcommitted);
    dayMeterLabel.textContent =
      `${t(lang, "day.committed")}: ${num(lang, ledger.committedHoursPerDay, 1)} / 24 ${t(lang, "unit.hours")} · ` +
      `${t(lang, "day.free")}: ${num(lang, Math.max(0, 24 - ledger.committedHoursPerDay), 1)}`;
    dayWarning.hidden = !ledger.overcommitted;
    dayWarning.textContent = t(lang, "day.overcommitted");

    const cadenceKey: Record<Category["cadence"], string> = {
      daily: "day.perDay", workday: "day.perWorkday", weekly: "day.perWeek",
    };
    for (const cat of CATEGORIES) {
      const row = rows.get(cat.id)!;
      const value = profile.hours[cat.id] ?? cat.defaultHours;
      row.label.textContent = cat.labels[lang];
      row.readout.textContent = num(lang, value, value % 1 === 0 ? 0 : 2);
      row.cadence.textContent = t(lang, cadenceKey[cat.cadence]);
      if (focused !== row.slider) row.slider.value = String(value);
      const active = profile.buckets[cat.id] ?? cat.defaultBucket;
      for (const [b, btn] of row.buttons) {
        btn.textContent = t(lang, `bucket.${b}`);
        btn.title = t(lang, `bucket.${b}.hint`);
        btn.classList.toggle("on", b === active);
        btn.setAttribute("aria-pressed", String(b === active));
      }
    }

    // ledger
    ledgerTitle.textContent = t(lang, "ledger.title");
    const total = Math.max(1, ledger.totalHours);
    const parts: Array<[string, number]> = [
      ["alive", ledger.byBucket.alive],
      ["neutral", ledger.byBucket.neutral],
      ["leak", ledger.byBucket.leak],
      ["unallocated", Math.max(0, ledger.unallocatedHours)],
    ];
    for (const [k, v] of parts) {
      bucketSegs.get(k)!.style.width = `${(v / total) * 100}%`;
    }
    bucketLegend.textContent = "";
    for (const [k, v] of parts) {
      bucketLegend.append(
        el("span", { class: "legend-item" }, [
          el("span", { class: `swatch bucket-${k}` }),
          `${t(lang, `bucket.${k}`)} — ${hoursAsYears(lang, v)} (${percent(lang, v / total)})`,
        ]),
      );
    }

    ledgerBody.textContent = "";
    for (const row of ledger.rows) {
      if (row.totalHours <= 0) continue;
      const bar = el("div", { class: "bar" }, [
        el("div", { class: `bar-fill bucket-${row.bucket}` }),
      ]);
      (bar.firstElementChild as HTMLElement).style.width = `${row.share * 100}%`;
      const meta =
        row.category.phase === "working"
          ? ` · ${num(lang, row.activeYears, 0)} ${t(lang, "you.years")} ${t(lang, "ledger.untilRetirement")}`
          : "";
      ledgerBody.append(
        el("div", { class: "ledger-row" }, [
          el("span", { class: "ledger-name" }, [row.category.labels[lang]]),
          bar,
          el("span", { class: "ledger-num" }, [
            `${hours(lang, row.totalHours)} · ${years(lang, hoursToYears(row.totalHours))}${meta}`,
          ]),
        ]),
      );
    }

    // levers
    leversTitle.textContent = t(lang, "levers.title");
    leversHint.textContent = t(lang, "levers.hint");
    exchangeLine.textContent =
      `${t(lang, "levers.exchange")} ${hours(lang, dailyHourValue(ledger))} · ` +
      `${years(lang, hoursToYears(dailyHourValue(ledger)))}`;
    leversBody.textContent = "";
    for (const lever of levers(profile).slice(0, 8)) {
      const catId = lever.vars.category;
      const label = t(lang, `levers.${lever.key}`, {
        ...lever.vars,
        category:
          typeof catId === "string"
            ? (CATEGORIES.find((c) => c.id === catId)?.labels[lang] ?? catId)
            : "",
      });
      leversBody.append(
        el("div", { class: "lever" }, [
          el("span", { class: `tag tag-${lever.kind}` }, [t(lang, `levers.${lever.kind}`)]),
          el("span", { class: "lever-label" }, [label]),
          el("span", { class: "lever-value" }, [
            `${t(lang, lever.deltaHours >= 0 ? "levers.frees" : "levers.costs")} ` +
              `${hours(lang, Math.abs(lever.deltaHours))} · ` +
              `${years(lang, Math.abs(hoursToYears(lever.deltaHours)))}`,
          ]),
        ]),
      );
    }

    // method
    methodTitle.textContent = t(lang, "method.title");
    methodSource.textContent = t(lang, "method.source", {
      year: WHO_YEAR,
      error: num(lang, FIT_MAX_ERROR_YEARS, 2),
    });
    methodUnits.textContent = t(lang, "method.units");
    methodDist.textContent = t(lang, "method.distribution", {
      span: num(lang, h.p90Age - h.p10Age, 0),
    });
    methodPrivacy.textContent = t(lang, "method.privacy");
    shareBtn.textContent = t(lang, "share.copy");
    resetBtn.textContent = t(lang, "share.reset");
  };
}

export function flashShare(root: El, lang: Lang): void {
  const btn = root.querySelector<HTMLButtonElement>(".action");
  if (!btn) return;
  const original = btn.textContent;
  btn.textContent = t(lang, "share.copied");
  setTimeout(() => {
    btn.textContent = original;
  }, 1600);
}
