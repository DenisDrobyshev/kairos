// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount, type ViewCallbacks } from "../src/ui/view.js";
import { decode, defaultProfile, encode, type AppState } from "../src/ui/state.js";
import { CATEGORIES, type Profile } from "../src/core/index.js";

function state(over: Partial<Profile> = {}, lang: "ru" | "en" = "ru"): AppState {
  return { lang, profile: { ...defaultProfile(), ...over } };
}

function harness(cb: Partial<ViewCallbacks> = {}) {
  const root = document.createElement("div");
  document.body.append(root);
  const calls: Array<Partial<Profile>> = [];
  const update = mount(root, {
    onProfile: (p) => calls.push(p),
    onLang: () => {},
    onReset: () => {},
    onShare: () => {},
    ...cb,
  });
  return { root, update, calls };
}

beforeEach(() => {
  document.body.textContent = "";
});

describe("view", () => {
  it("renders a complete page from the default profile", () => {
    const { root, update } = harness();
    update(state());

    expect(root.querySelector("h1")?.textContent).toBe("kairos");
    // The headline is a median death age, so it must be a real number well
    // beyond the current age rather than an empty or NaN placeholder.
    const figure = Number(root.querySelector(".figure")?.textContent?.replace(",", "."));
    expect(Number.isFinite(figure)).toBe(true);
    expect(figure).toBeGreaterThan(defaultProfile().age);

    expect(root.querySelectorAll(".cat-row")).toHaveLength(CATEGORIES.length);
    expect(root.querySelectorAll(".ledger-row").length).toBeGreaterThan(5);
    expect(root.querySelectorAll(".lever").length).toBeGreaterThan(2);
  });

  it("draws one square per week of a whole life", () => {
    const { root, update } = harness();
    update(state());
    expect(root.querySelectorAll(".week")).toHaveLength(95 * 52);
    expect(root.querySelectorAll(".week.lived").length).toBe(25 * 52);
    expect(root.querySelectorAll(".week.left").length).toBeGreaterThan(0);
  });

  it("moves the lived boundary when age changes", () => {
    const { root, update } = harness();
    update(state({ age: 25 }));
    expect(root.querySelectorAll(".week.lived")).toHaveLength(25 * 52);
    update(state({ age: 40 }));
    expect(root.querySelectorAll(".week.lived")).toHaveLength(40 * 52);
  });

  it("reports a possible day for the shipped defaults", () => {
    const { root, update } = harness();
    update(state());
    const warning = root.querySelector<HTMLElement>(".warning");
    expect(warning?.hidden).toBe(true);
  });

  it("warns instead of silently absorbing an impossible day", () => {
    const { root, update } = harness();
    const hours = { ...defaultProfile().hours, feeds: 10, video: 10, games: 8 };
    update(state({ hours }));
    const warning = root.querySelector<HTMLElement>(".warning");
    expect(warning?.hidden).toBe(false);
    expect(warning?.textContent).toContain("сутках");
  });

  it("switches both languages, not only labels", () => {
    const { root, update } = harness();
    update(state({}, "ru"));
    const ru = root.textContent ?? "";
    update(state({}, "en"));
    const en = root.textContent ?? "";
    expect(ru).toContain("Сколько времени у тебя осталось");
    expect(en).toContain("How much time you actually have left");
    expect(en).not.toContain("Сколько времени у тебя осталось");
  });

  it("emits a sparse patch when a slider moves", () => {
    const { root, update, calls } = harness();
    update(state());
    const slider = root.querySelector<HTMLInputElement>('input[type="range"]');
    expect(slider).not.toBeNull();
    slider!.value = "3";
    slider!.dispatchEvent(new Event("input"));
    expect(calls).toHaveLength(1);
    expect(Object.keys(calls[0]!)).toEqual(["hours"]);
    expect(Object.values(calls[0]!.hours!)).toEqual([3]);
  });

  it("emits a bucket change when a segment is clicked", () => {
    const { root, update, calls } = harness();
    update(state());
    const leak = root.querySelector<HTMLButtonElement>(".seg-leak");
    leak!.click();
    expect(calls).toHaveLength(1);
    expect(Object.values(calls[0]!.buckets!)).toEqual(["leak"]);
  });

  it("marks the active bucket for assistive technology too", () => {
    const { root, update } = harness();
    update(state());
    const pressed = root.querySelectorAll('.seg[aria-pressed="true"]');
    expect(pressed).toHaveLength(CATEGORIES.length);
  });

  it("survives a horizon that ends before retirement", () => {
    const { root, update } = harness();
    expect(() => update(state({ age: 80, retirementAge: 65 }))).not.toThrow();
    expect(root.querySelectorAll(".week.lived")).toHaveLength(80 * 52);
  });
});

describe("shareable state", () => {
  it("round-trips a profile through the URL", () => {
    const original = state(
      { age: 31, sex: "female", region: "de", basis: "p90", vacationDays: 40 },
      "en",
    );
    const restored = decode(encode(original), "ru");
    expect(restored.lang).toBe("en");
    expect(restored.profile.age).toBe(31);
    expect(restored.profile.sex).toBe("female");
    expect(restored.profile.region).toBe("de");
    expect(restored.profile.basis).toBe("p90");
    expect(restored.profile.vacationDays).toBe(40);
    expect(restored.profile.hours).toEqual(original.profile.hours);
    expect(restored.profile.buckets).toEqual(original.profile.buckets);
  });

  it("keeps the link readable rather than base64", () => {
    const encoded = encode(state());
    expect(encoded).toContain("sleep-8-n");
    expect(encoded).toContain("age=25");
  });

  it("falls back to defaults on a hostile or stale link", () => {
    for (const bad of ["", "#v=99&age=4000", "v=1&age=notanumber&c=___", "#c=nonsense.5.z"]) {
      const restored = decode(bad, "ru");
      expect(restored.profile.age).toBeGreaterThan(0);
      expect(restored.profile.age).toBeLessThanOrEqual(100);
      expect(Object.keys(restored.profile.hours).sort()).toEqual(
        CATEGORIES.map((c) => c.id).sort(),
      );
    }
  });

  it("never lets a link set retirement before the current age", () => {
    const restored = decode(encode(state({ age: 70, retirementAge: 65 })), "ru");
    expect(restored.profile.retirementAge).toBeGreaterThanOrEqual(restored.profile.age);
  });

  it("clamps an out-of-range category to what the model allows", () => {
    const restored = decode("v=1&c=sleep-999-a", "ru");
    const sleep = CATEGORIES.find((c) => c.id === "sleep")!;
    expect(restored.profile.hours.sleep).toBe(sleep.max);
  });
});

describe("no accidental network", () => {
  it("computes without touching fetch", () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    const { update } = harness();
    update(state());
    expect(spy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
