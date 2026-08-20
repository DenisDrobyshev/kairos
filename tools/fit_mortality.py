#!/usr/bin/env python3
"""
Calibrate the mortality model against WHO life tables, and generate both the
TypeScript constants and the test fixture from the same run.

Every number in `src/core/populations.ts` comes out of this script. Nothing in
the model is hand-tuned, and nothing is remembered from anywhere -- rerun it and
the constants regenerate from the WHO API.

    python tools/fit_mortality.py

Source: WHO Global Health Observatory, life tables by country.
  LIFE_0000000029  nMx -- age-specific death rate
  LIFE_0000000035  ex  -- expectation of life at age x
  https://www.who.int/data/gho/data/themes/mortality-and-global-health-estimates

Method: Gompertz-Makeham, mu(x) = A + B*exp(C*x), fitted by least squares.

The objective is the published `ex` curve across adult ages, not the `mx` curve.
That choice matters. Fitting log(mx) with equal weight per age band spreads
error evenly across rates, but rates at age 20 are three orders of magnitude
smaller than at 85, so an even fit in log-rate space lands 1--2 years low on
life expectancy -- which is the quantity users actually read. Observed death
rates stay in the objective at a lower weight, to keep the hazard curve honest
where the expectancy integral is insensitive to it.

Perks/logistic old-age deceleration was tried and dropped: the deceleration
parameter is not identifiable from abridged tables that close at 85+, and the
optimiser drove it to values around 1e-40 while achieving nothing that the
three-parameter fit did not already achieve.
"""

from __future__ import annotations

import json
import math
import re
import ssl
import urllib.request
from pathlib import Path

import numpy as np
from scipy.optimize import least_squares

YEAR = 2021
BASE = "https://ghoapi.azureedge.net/api/"
MX, EX = "LIFE_0000000029", "LIFE_0000000035"

POPULATIONS = {
    "ru_male": ("RUS", "SEX_MLE"),
    "ru_female": ("RUS", "SEX_FMLE"),
    "us_male": ("USA", "SEX_MLE"),
    "us_female": ("USA", "SEX_FMLE"),
    "de_male": ("DEU", "SEX_MLE"),
    "de_female": ("DEU", "SEX_FMLE"),
    "world_male": ("GLOBAL", "SEX_MLE"),
    "world_female": ("GLOBAL", "SEX_FMLE"),
}

TOP = 125.0
STEP = 0.02
GRID = np.arange(0.0, TOP + STEP, STEP)

_ctx = ssl.create_default_context()
_ctx.check_hostname = False
_ctx.verify_mode = ssl.CERT_NONE


def fetch(indicator: str, spatial: str, sex: str) -> dict[float, float]:
    """Age-band midpoint -> value, for closed bands only (85+ is dropped)."""
    query = (
        f"$filter=SpatialDim%20eq%20%27{spatial}%27"
        f"%20and%20TimeDim%20eq%20{YEAR}"
        f"%20and%20Dim1%20eq%20%27{sex}%27"
    )
    with urllib.request.urlopen(BASE + indicator + "?" + query, timeout=60, context=_ctx) as r:
        rows = json.load(r)["value"]
    out: dict[float, float] = {}
    for row in rows:
        m = re.match(r"AGEGROUP_YEARS(\d+)-(\d+)$", row.get("Dim2") or "")
        if m:
            lo, hi = int(m.group(1)), int(m.group(2))
            out[(lo + hi + 1) / 2.0] = row["NumericValue"]
    return out


def curves(A: float, B: float, C: float):
    """Cumulative hazard and remaining life expectancy over the whole age grid."""
    H = A * GRID + (B / C) * np.expm1(C * GRID)
    S = np.exp(-H)
    seg = (S[1:] + S[:-1]) * 0.5 * STEP
    T = np.concatenate([np.cumsum(seg[::-1])[::-1], [0.0]])
    return H, T / np.maximum(S, 1e-300)


def fit(ex: dict[float, float], mx: dict[float, float]):
    ex_ages = np.array(sorted(a for a in ex if 22 <= a <= 83))
    ex_target = np.array([ex[a] for a in ex_ages])
    mx_ages = np.array(sorted(a for a in mx if 20 <= a <= 85))
    mx_target = np.log(np.array([mx[a] for a in mx_ages]))

    def resid(p):
        A, B, C = p[0] ** 2, math.exp(p[1]), abs(p[2])
        _, ex_model = curves(A, B, C)
        primary = np.interp(ex_ages, GRID, ex_model) - ex_target
        secondary = 0.35 * (np.log(A + B * np.exp(C * mx_ages)) - mx_target)
        return np.concatenate([primary, secondary])

    best, best_cost = None, math.inf
    for a0 in (0.02, 0.001):
        for c0 in (0.08, 0.10):
            s = least_squares(resid, [a0, math.log(3e-5), c0], xtol=1e-14, ftol=1e-14)
            if s.cost < best_cost:
                best, best_cost = s, s.cost

    A, B, C = best.x[0] ** 2, math.exp(best.x[1]), abs(best.x[2])
    if A < 1e-9:
        A = 0.0  # unidentified for this population; a bare Gompertz fits it
    _, ex_model = curves(A, B, C)
    err = float(np.max(np.abs(np.interp(ex_ages, GRID, ex_model) - ex_target)))
    return (A, B, C), err


def sig(x: float, digits: int = 6) -> str:
    return "0" if x == 0 else f"{float(f'{x:.{digits}g}'):g}"


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    fitted: dict[str, tuple[float, float, float]] = {}
    reference: dict[str, dict[str, float]] = {}
    worst = 0.0

    print(f"{'population':<14}{'A':>12}{'B':>12}{'C':>9}{'max err (yr)':>14}")
    for key, (spatial, sex) in POPULATIONS.items():
        ex, mx = fetch(EX, spatial, sex), fetch(MX, spatial, sex)
        (A, B, C), err = fit(ex, mx)
        fitted[key] = (A, B, C)
        worst = max(worst, err)
        reference[key] = {
            "ex": {str(a): v for a, v in sorted(ex.items()) if 22 <= a <= 83},
            "maxError": round(err, 4),
        }
        print(f"{key:<14}{sig(A):>12}{sig(B):>12}{C:>9.6f}{err:>14.3f}")

    print(f"\nworst-case error across all populations and adult ages: {worst:.3f} years")

    body = "\n".join(
        f"  {k}: {{ A: {sig(A)}, B: {sig(B)}, C: {C:.6f} }},"
        for k, (A, B, C) in fitted.items()
    )
    ts = f'''// GENERATED by tools/fit_mortality.py -- do not edit by hand.
//
// Gompertz-Makeham parameters fitted to WHO Global Health Observatory life
// tables for {YEAR}. Across every adult age from 22 to 83, the model reproduces
// WHO's published life expectancy to within {worst:.2f} years.
//
// Rerun the script to regenerate; see docs/mortality.md for the method.

import type {{ MortalityParams, PopulationKey }} from "./mortality.js";

export const WHO_YEAR = {YEAR};

/** Largest deviation from WHO published ex, in years, over ages 22--83. */
export const FIT_MAX_ERROR_YEARS = {worst:.4f};

export const POPULATIONS: Readonly<Record<PopulationKey, MortalityParams>> = {{
{body}
}} as const;
'''
    (root / "src" / "core" / "populations.ts").write_text(ts, encoding="utf-8")

    fixtures = root / "test" / "fixtures"
    fixtures.mkdir(parents=True, exist_ok=True)
    (fixtures / "who-reference.json").write_text(
        json.dumps({"year": YEAR, "source": "WHO GHO life tables",
                    "populations": reference}, indent=2),
        encoding="utf-8",
    )
    print("wrote src/core/populations.ts and test/fixtures/who-reference.json")


if __name__ == "__main__":
    main()
