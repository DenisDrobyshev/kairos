/**
 * The clock.
 *
 * Two dials in one figure, and the tension between them is the whole point.
 *
 * The inner face is an ordinary working clock, showing the actual time, with a
 * second hand that actually moves. It is the present tense: unremarkable,
 * indifferent, and never still.
 *
 * The outer ring is your life. Twelve o'clock is birth, a full turn is the
 * median age at death, and the filled arc is how much of it has already gone.
 * The hand on that ring moves too, just far too slowly to watch.
 *
 * The counter underneath decrements every second. It is the harshest element on
 * the page and it is there deliberately -- this is the register the project was
 * asked for. What it must never do is lie: it is drawn from the same median
 * horizon as everything else, and a median is a coin flip rather than a
 * sentence, which is why the range stays printed next to it.
 */

const SIZE = 240;
const CENTER = SIZE / 2;
const RING_R = 108;
const FACE_R = 78;
const NS = "http://www.w3.org/2000/svg";

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

export interface ClockHandle {
  readonly root: SVGSVGElement;
  readonly readout: HTMLElement;
  /** Point the life ring and restart the countdown. */
  set(livedFraction: number, remainingSeconds: number): void;
  stop(): void;
}

export function createClock(): ClockHandle {
  const root = svg("svg", {
    viewBox: `0 0 ${SIZE} ${SIZE}`,
    class: "clock",
    role: "img",
    "aria-label": "clock",
  });

  const ringCircumference = 2 * Math.PI * RING_R;

  // Outer ring: the life dial.
  root.append(
    svg("circle", {
      cx: CENTER, cy: CENTER, r: RING_R,
      fill: "none", stroke: "var(--line)", "stroke-width": 6,
    }),
  );
  const lived = svg("circle", {
    cx: CENTER, cy: CENTER, r: RING_R,
    fill: "none", stroke: "var(--alive)", "stroke-width": 6,
    "stroke-linecap": "butt",
    "stroke-dasharray": `0 ${ringCircumference}`,
    transform: `rotate(-90 ${CENTER} ${CENTER})`,
  });
  root.append(lived);

  // A marker sitting exactly where you are now on that ring.
  const marker = svg("circle", { r: 4.5, fill: "var(--text)" });
  root.append(marker);

  // Inner face: an ordinary clock.
  root.append(
    svg("circle", {
      cx: CENTER, cy: CENTER, r: FACE_R,
      fill: "var(--surface-2)", stroke: "var(--line)", "stroke-width": 1,
    }),
  );

  for (let i = 0; i < 60; i++) {
    const major = i % 5 === 0;
    const angle = (i / 60) * Math.PI * 2;
    const outer = FACE_R - 6;
    const inner = outer - (major ? 9 : 4);
    root.append(
      svg("line", {
        x1: CENTER + Math.sin(angle) * inner,
        y1: CENTER - Math.cos(angle) * inner,
        x2: CENTER + Math.sin(angle) * outer,
        y2: CENTER - Math.cos(angle) * outer,
        stroke: major ? "var(--dim)" : "var(--line)",
        "stroke-width": major ? 2 : 1,
      }),
    );
  }

  const hourHand = svg("line", {
    stroke: "var(--text)", "stroke-width": 4, "stroke-linecap": "round",
  });
  const minuteHand = svg("line", {
    stroke: "var(--text)", "stroke-width": 2.5, "stroke-linecap": "round",
  });
  const secondHand = svg("line", {
    stroke: "var(--leak)", "stroke-width": 1.4, "stroke-linecap": "round",
  });
  root.append(hourHand, minuteHand, secondHand);
  root.append(svg("circle", { cx: CENTER, cy: CENTER, r: 3.5, fill: "var(--leak)" }));

  const readout = document.createElement("p");
  readout.className = "clock-readout";

  function hand(line: SVGLineElement, turns: number, length: number, back = 12): void {
    const angle = turns * Math.PI * 2;
    line.setAttribute("x1", String(CENTER - Math.sin(angle) * back));
    line.setAttribute("y1", String(CENTER + Math.cos(angle) * back));
    line.setAttribute("x2", String(CENTER + Math.sin(angle) * length));
    line.setAttribute("y2", String(CENTER - Math.cos(angle) * length));
  }

  const reduced =
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;

  let remaining = 0;
  let timer: ReturnType<typeof setInterval> | undefined;

  function paintCountdown(): void {
    const total = Math.max(0, Math.floor(remaining));
    const years = Math.floor(total / 31_556_952);
    const days = Math.floor((total % 31_556_952) / 86_400);
    const h = Math.floor((total % 86_400) / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n: number): string => String(n).padStart(2, "0");
    readout.textContent = `${years} · ${days} · ${pad(h)}:${pad(m)}:${pad(s)}`;
  }

  function tick(): void {
    const now = new Date();
    const seconds = now.getSeconds() + (reduced ? 0 : now.getMilliseconds() / 1000);
    const minutes = now.getMinutes() + seconds / 60;
    const hours = (now.getHours() % 12) + minutes / 60;
    hand(hourHand, hours / 12, FACE_R - 34);
    hand(minuteHand, minutes / 60, FACE_R - 18);
    hand(secondHand, seconds / 60, FACE_R - 12, 18);

    if (remaining > 0) {
      remaining -= 1;
      paintCountdown();
    }
  }

  tick();
  timer = setInterval(tick, 1000);

  return {
    root,
    readout,
    set(livedFraction: number, remainingSeconds: number): void {
      const fraction = Math.min(1, Math.max(0, livedFraction));
      lived.setAttribute(
        "stroke-dasharray",
        `${fraction * ringCircumference} ${ringCircumference}`,
      );
      const angle = fraction * Math.PI * 2;
      marker.setAttribute("cx", String(CENTER + Math.sin(angle) * RING_R));
      marker.setAttribute("cy", String(CENTER - Math.cos(angle) * RING_R));
      remaining = Math.max(0, remainingSeconds);
      paintCountdown();
    },
    stop(): void {
      if (timer !== undefined) clearInterval(timer);
      timer = undefined;
    },
  };
}
