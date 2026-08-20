import { CATEGORY_BY_ID, type Profile } from "./core/index.js";
import { detectLang, type Lang } from "./ui/i18n.js";
import { defaultProfile, encode, load, persist, type AppState } from "./ui/state.js";
import { flashShare, mount } from "./ui/view.js";
import "./styles.css";

const root = document.getElementById("app");
if (!root) throw new Error("missing #app");

let state: AppState = load(detectLang());

/**
 * `hours` and `buckets` arrive as sparse patches -- the view sends only the
 * category the user touched -- so they merge rather than replace. Everything
 * else is a plain overwrite.
 */
function applyPatch(profile: Profile, patch: Partial<Profile>): Profile {
  const next: Profile = { ...profile, ...patch };
  if (patch.hours) {
    const hours: Record<string, number> = { ...profile.hours };
    for (const [id, value] of Object.entries(patch.hours)) {
      const cat = CATEGORY_BY_ID.get(id);
      if (cat) hours[id] = Math.min(cat.max, Math.max(0, value));
    }
    Object.assign(next, { hours });
  }
  if (patch.buckets) {
    Object.assign(next, { buckets: { ...profile.buckets, ...patch.buckets } });
  }
  // Retiring before today is not a plan, it is a typo.
  if (next.retirementAge < next.age) {
    Object.assign(next, { retirementAge: next.age });
  }
  return next;
}

const update = mount(root, {
  onProfile(patch) {
    state = { ...state, profile: applyPatch(state.profile, patch) };
    commit();
  },
  onLang(lang: Lang) {
    state = { ...state, lang };
    commit();
  },
  onReset() {
    state = { ...state, profile: defaultProfile() };
    commit();
  },
  async onShare() {
    const url = `${location.origin}${location.pathname}#${encode(state)}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard needs a secure context and is blocked in sandboxed frames.
      // `prompt` is the fallback, and is itself blocked in some of them, so it
      // gets its own guard rather than taking the handler down with it.
      try {
        prompt(url);
      } catch {
        /* nothing left to try; the address bar still holds the same link */
      }
    }
    flashShare(root, state.lang);
  },
});

function commit(): void {
  persist(state);
  update(state);
}

window.addEventListener("hashchange", () => {
  const next = load(state.lang);
  state = next;
  update(state);
});

commit();
