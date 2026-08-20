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
  CATEGORY_BY_ID,
  BUCKETS,
  buildPlan,
  computeLedger,
  levers,
  dailyHourValue,
  hoursToYears,
  FIT_MAX_ERROR_YEARS,
  WHO_YEAR,
  type Bucket,
  type Category,
  type HorizonBasis,
  type Overlap,
  type PlanStep,
  type Profile,
  type Region,
  type Sex,
} from "../core/index.js";
import { t, LANGS, type Lang } from "./i18n.js";
import type { AppState } from "./state.js";
import { age as fmtAge, bigCount, hours, hoursAsYears, num, percent, years } from "./format.js";

export interface ViewCallbacks {
  onProfile(patch: Partial<Profile>): void;
  onTarget(hoursPerDay: number): void;
  onApplyPlan(): void;
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
  const duringHint = el("p", { class: "hint" });
  const bucketHint = el("p", { class: "hint" });
  const dayWarning = el("p", { class: "warning", hidden: "" });
  const dayMeter = el("div", { class: "meter" });
  const dayMeterFill = el("div", { class: "meter-fill" });
  dayMeter.append(dayMeterFill);
  const dayMeterLabel = el("p", { class: "meter-label" });

  /** The "of that, spent on" controls, present only on host categories. */
  interface DuringControls {
    readonly wrap: HTMLElement;
    readonly label: El;
    readonly select: HTMLSelectElement;
    readonly slider: HTMLInputElement;
    readonly readout: El;
  }

  interface Row {
    readonly slider: HTMLInputElement;
    readonly readout: El;
    readonly label: El;
    readonly cadence: El;
    readonly buttons: Map<Bucket, HTMLButtonElement>;
    readonly during?: DuringControls;
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

      const children: (Node | string)[] = [
        el("div", { class: "cat-head" }, [label, readout, cadence]),
        slider,
        seg,
      ];

      let during: DuringControls | undefined;
      if (cat.canHost) {
        const dLabel = el("span", { class: "during-label" });
        const dSelect = el("select", { class: "during-select" });
        const dSlider = el("input", {
          type: "range", min: "0", max: String(cat.max), step: String(cat.step),
        });
        const dReadout = el("span", { class: "during-value" });
        const emit = (): void =>
          cb.onProfile({
            during: {
              [cat.id]: { activity: dSelect.value, hours: Number(dSlider.value) },
            } as Record<string, Overlap>,
          });
        dSelect.addEventListener("change", emit);
        dSlider.addEventListener("input", emit);
        const wrap = el("div", { class: "during" }, [dLabel, dSelect, dSlider, dReadout]);
        during = { wrap, label: dLabel, select: dSelect, slider: dSlider, readout: dReadout };
        children.push(wrap);
      }

      dayBody.append(el("div", { class: "cat-row" }, children));
      rows.set(cat.id, {
        slider, readout, label, cadence, buttons,
        ...(during ? { during } : {}),
      });
    }
  }

  main.append(
    el("section", { class: "card" }, [
      dayTitle, dayHint, duringHint, dayMeter, dayMeterLabel, dayWarning, bucketHint, dayBody,
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

  // ---- section: plan ------------------------------------------------------
  const planTitle = el("h2");
  const planTargetLabel = el("label", { for: "f-target" });
  const planTargetInput = el("input", {
    type: "range", min: "0", max: "12", step: "0.25", id: "f-target",
  });
  const planTargetValue = el("span", { class: "cat-value" });
  const planCurrent = el("p", { class: "hint" });
  const planFreeTitle = el("h3", { class: "group" });
  const planFreeHint = el("p", { class: "hint" });
  const planFreeBody = el("div", { class: "plan-steps" });
  const planCostlyTitle = el("h3", { class: "group" });
  const planCostlyHint = el("p", { class: "hint" });
  const planCostlyBody = el("div", { class: "plan-steps" });
  const planResult = el("p", { class: "exchange" });
  const planShort = el("p", { class: "warning", hidden: "" });
  const planApply = el("button", { type: "button", class: "action" });

  planTargetInput.addEventListener("input", () =>
    cb.onTarget(Number(planTargetInput.value)),
  );
  planApply.addEventListener("click", () => cb.onApplyPlan());

  main.append(
    el("section", { class: "card plan" }, [
      planTitle,
      el("div", { class: "plan-target" }, [
        planTargetLabel,
        planTargetInput,
        planTargetValue,
      ]),
      planCurrent,
      planFreeTitle, planFreeHint, planFreeBody,
      planCostlyTitle, planCostlyHint, planCostlyBody,
      planResult, planShort,
      el("div", { class: "actions" }, [planApply]),
    ]),
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
    duringHint.textContent = t(lang, "day.during.hint");
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

      const d = row.during;
      if (d) {
        // Nothing to share out of an activity you do not do.
        d.wrap.hidden = value <= 0;
        d.label.textContent = t(lang, "day.during");

        const guests = CATEGORIES.filter((c) => c.canOverlap && c.id !== cat.id);
        const built = `${lang}|${guests.map((g) => g.id).join(",")}`;
        if (d.select.dataset.built !== built) {
          d.select.textContent = "";
          d.select.append(el("option", { value: "" }, [t(lang, "day.during.none")]));
          for (const g of guests) {
            d.select.append(el("option", { value: g.id }, [g.labels[lang]]));
          }
          d.select.dataset.built = built;
        }

        const overlap = profile.during[cat.id];
        const activity = overlap?.activity ?? "";
        d.select.value = activity;
        // You cannot spend more of the hour than the hour holds, so the slider
        // is bounded by the host's own figure rather than the category maximum.
        d.slider.max = String(value);
        d.slider.disabled = activity === "";
        const shared = activity ? Math.min(overlap?.hours ?? 0, value) : 0;
        if (focused !== d.slider) d.slider.value = String(shared);
        d.readout.textContent = activity
          ? `${num(lang, shared, shared % 1 === 0 ? 0 : 2)} ${t(lang, "unit.hours")}`
          : "";
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

    // plan
    const plan = buildPlan(profile, state.target);
    const catLabel = (id: string): string =>
      CATEGORY_BY_ID.get(id)?.labels[lang] ?? id;

    planTitle.textContent = t(lang, "plan.title");
    planTargetLabel.textContent = t(lang, "plan.target");
    if (focused !== planTargetInput) planTargetInput.value = String(state.target);
    planTargetValue.textContent = `${num(lang, state.target, state.target % 1 === 0 ? 0 : 2)} ${t(lang, "plan.perDay")}`;
    planCurrent.textContent =
      `${t(lang, "plan.current")} ${num(lang, plan.currentPerDay, 1)} ${t(lang, "plan.perDay")}`;

    const renderSteps = (host: El, steps: readonly PlanStep[]): void => {
      host.textContent = "";
      for (const step of steps) {
        const label = t(lang, `plan.step.${step.key}`, {
          category: catLabel(step.categoryId),
          guest: step.guestId ? catLabel(step.guestId) : "",
          hours: num(lang, step.hours, step.hours % 1 === 0 ? 0 : 2),
        });
        host.append(
          el("div", { class: "plan-step" }, [
            el("span", { class: `tag tag-${step.kind}` }, [t(lang, `levers.${step.kind === "structural" ? "structural" : "habit"}`)]),
            el("span", { class: "lever-label" }, [label]),
            el("span", { class: "lever-value" }, [
              t(lang, "plan.gain", { hours: num(lang, step.gainPerDay, 2) }),
            ]),
          ]),
        );
      }
    };

    const done = plan.free.length === 0 && plan.costly.length === 0;
    planFreeTitle.hidden = done;
    planFreeHint.hidden = done;
    planCostlyTitle.hidden = done || plan.costly.length === 0;
    planCostlyHint.hidden = done || plan.costly.length === 0;
    planApply.hidden = done;

    planFreeTitle.textContent = t(lang, "plan.free.title");
    planFreeHint.textContent =
      plan.free.length > 0 ? t(lang, "plan.free.hint") : t(lang, "plan.free.none");
    planCostlyTitle.textContent = t(lang, "plan.costly.title");
    planCostlyHint.textContent = t(lang, "plan.costly.hint");
    planApply.textContent = t(lang, "plan.apply");
    renderSteps(planFreeBody, plan.free);
    renderSteps(planCostlyBody, plan.costly);

    planResult.textContent = done
      ? t(lang, "plan.done")
      : t(lang, "plan.result", {
          hours: num(lang, plan.achievedPerDay, 1),
          // Hours a day, held for the rest of the horizon, expressed as years.
          years: years(
            lang,
            hoursToYears(plan.achievedPerDay * dailyHourValue(ledger)),
          ),
        });
    planShort.hidden = plan.shortfallPerDay <= 0.01;
    planShort.textContent = t(lang, "plan.short", {
      hours: num(lang, plan.shortfallPerDay, 1),
    });

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
