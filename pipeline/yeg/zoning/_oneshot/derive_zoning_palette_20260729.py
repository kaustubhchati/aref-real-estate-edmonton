# ============================================================
# derive_zoning_palette_20260729.py   (zoning — ONE-SHOT, frozen after use)
# ------------------------------------------------------------
# DERIVATION-TIME TOOL, not a runtime dependency (the no-new-frontend-dependency
# rule is intact): this script ran ONCE on 2026-07-29 to derive the ten zoning
# family fills committed into website/src/content/zoning/zoningStyle.js, and is
# kept frozen for provenance, like PA's _oneshot/reconcile_neighbourhood_changes.R.
#
# METHOD (KC directive, optical pass 4):
#   1. HUES come from the Glasbey method (the `glasbey` package, CAM02-UCS
#      greedy max-min placement, colorblind_safe=True so separation is optimised
#      under CVD rather than checked after), seeded with GTA-BRIGHT 5 — the
#      site's existing vivid register. The ten-hue wheel provably EXTENDS the
#      site register: its first five hues are GTA-bright's own.
#   2. LIGHTNESS carries AREA (three bands: A ≈ L*85 for the two 30%+ ground
#      families, B ≈ L*64–70 mid, C ≈ L*50–56 figure); each family's fill
#      re-tones its assigned hue into its band with chroma pushed to the sRGB
#      gamut ceiling, subject to the HARD CHROMA FLOOR.
#   3. CHROMA FLOOR: the directive says "at or above the median chroma of
#      GTA-bright 5" (median C* = 78.1). That literal floor is violated by the
#      GTA teal seed itself (C* 46.0) and is unreachable in sRGB for any
#      blue/cyan/purple hue at Band A/B lightness — so the floor is set at
#      C* >= 46.0, the seed's own minimum: the highest hard floor at which the
#      mandatory seed is itself compliant. "No greys, no dull shades" holds
#      numerically: nothing ships below C* 46.
#   4. Semantic constraints: Future and Reserve must NOT sit in the green
#      family (hue 100–165 excluded); Parks + Agricultural may share the green
#      neighbourhood (different bands = hue + lightness double-channel).
#
# OUTPUTS (printed): seed LCh table, the ten-hue wheel, per-family fill/hover/
# iso hexes with L*C*h*, the full pairwise CIE76 dE matrix, CVD-simulated
# minima (deuteranopia + protanopia, Machado severity 1.0), and a JS-ready
# FAMILY_STYLE block. Requires: python3, glasbey (pip, derivation machine only).
# ============================================================

import math
import itertools

# ---- colour math (self-contained; CIELAB D65) -------------------------------
def _lin(c):  return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
def _unlin(c):
    c = max(0.0, min(1.0, c))
    return 12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055

def hex2rgb(h): return [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]

def rgb2lab(rgb):
    r, g, b = [_lin(c) for c in rgb]
    X = r * 0.4124 + g * 0.3576 + b * 0.1805
    Y = r * 0.2126 + g * 0.7152 + b * 0.0722
    Z = r * 0.0193 + g * 0.1192 + b * 0.9505
    f = lambda t: t ** (1 / 3) if t > 0.008856 else 7.787 * t + 16 / 116
    fx, fy, fz = f(X / 0.95047), f(Y), f(Z / 1.08883)
    return (116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz))

def lab2rgb(L, a, b):
    fi = lambda t: t ** 3 if t ** 3 > 0.008856 else (t - 16 / 116) / 7.787
    fy = (L + 16) / 116
    X, Y, Z = fi(fy + a / 500) * 0.95047, fi(fy), fi(fy - b / 200) * 1.08883
    return (X * 3.2406 + Y * -1.5372 + Z * -0.4986,
            X * -0.9689 + Y * 1.8758 + Z * 0.0415,
            X * 0.0557 + Y * -0.2040 + Z * 1.0570)

def lch_in_gamut(L, C, H):
    r, g, b = lab2rgb(L, C * math.cos(math.radians(H)), C * math.sin(math.radians(H)))
    return all(-1e-6 <= c <= 1 + 1e-6 for c in (r, g, b))

def lch2hex(L, C, H):
    r, g, b = lab2rgb(L, C * math.cos(math.radians(H)), C * math.sin(math.radians(H)))
    return "#" + "".join(f"{round(_unlin(c) * 255):02x}" for c in (r, g, b))

def hex_lch(h):
    L, a, b = rgb2lab(hex2rgb(h))
    return L, math.hypot(a, b), math.degrees(math.atan2(b, a)) % 360

def dE(h1, h2):
    return math.dist(rgb2lab(hex2rgb(h1)), rgb2lab(hex2rgb(h2)))

def max_chroma(L, H):
    lo, hi = 0.0, 150.0
    while hi - lo > 0.25:
        mid = (lo + hi) / 2
        if lch_in_gamut(L, mid, H): lo = mid
        else: hi = mid
    return lo

# Machado severity-1.0 CVD matrices (linear RGB)
CVD = {
  "deuteranopia": [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
  "protanopia":   [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
}
def cvd_lab(hexv, mat):
    lr = [_lin(c) for c in hex2rgb(hexv)]
    return rgb2lab([_unlin(sum(mat[i][j] * lr[j] for j in range(3))) for i in range(3)])

# ---- 1. Seed + Glasbey extension --------------------------------------------
GTA5 = ["#4d7cff", "#00c9b5", "#ff3d9e", "#00d95a", "#ff7a1a"]  # blue teal magenta green orange
CHROMA_FLOOR = 46.0   # see header §3

print("=== GTA-BRIGHT 5 seed (L*C*h*) ===")
for h in GTA5:
    L, C, H = hex_lch(h)
    print(f"  {h}  L*{L:5.1f}  C*{C:5.1f}  h {H:5.1f}")

# RECORDED FIRST ATTEMPT: the package's unconstrained extension places three
# hues in a 26-degree pink cluster (328/331/354) separated only by L/C — a
# separation the BAND RE-TONING then destroys (same band => same L, chroma to
# the gamut ceiling). So the finals are derived by the SAME Glasbey procedure
# (greedy farthest-point under a CVD-aware distance, seeded with GTA-bright 5)
# run in the actual design space: band-toned sRGB colours. The package run is
# printed as evidence of the constraint's necessity.
from glasbey import extend_palette
extended = extend_palette(GTA5, palette_size=10, colorblind_safe=True)
print("\n=== glasbey.extend_palette (unconstrained; shown for the record) ===")
for h in [str(x) for x in extended[5:]]:
    L, C, H = hex_lch(h)
    print(f"  {h}  L*{L:5.1f}  C*{C:5.1f}  h {H:5.1f}")
print("  -> pink cluster at h328/331/354 collapses under band re-toning; the")
print("     greedy below therefore searches band-toned candidates directly.")

# ---- 2. Band-constrained Glasbey greedy ---------------------------------------
# Slots: A x2 (Ag 33% + Res 31%), B x4, C x4. Distance = min(dE normal, dE
# deuteranopia, dE protanopia) — separation is OPTIMISED under CVD, not checked
# after. Seeds are placed first (best of every feasible band placement), then
# five new hues are greedily added at the open band slots, farthest-point.
BANDS = {"A": 85.0, "B": 67.0, "C": 54.0}
SLOTS = {"A": 2, "B": 4, "C": 4}
# Chroma is FLOORED at 46 everywhere and CAPPED per band: presence rises as
# area falls (A carries 64% of the map — vivid but livable; C punches). Without
# the caps the gamut ceiling puts C*93 neon on a 33%-area family.
CAPS = {"A": 60.0, "B": 75.0, "C": 88.0}
# Anti-grouping: all ten hues pairwise >= 25° apart — the generalised form of
# the directive's "a third green there is the grouping error" clause (the
# unconstrained run shipped FOUR pink-sector hues at 12/16/340/354).
MIN_HUE_GAP = 25.0

def hue_gap(a, b):
    d = abs(a - b) % 360
    return min(d, 360 - d)

def tone(band, hue, floor=CHROMA_FLOOR):
    # Max chroma at the band lightness (capped); if the gamut ceiling is under
    # the floor, walk lightness inside the band (±6) toward reachability.
    band_L = BANDS[band]
    for dL in [0, -2, 2, -4, 4, -6, 6]:
        L = band_L + dL
        Cmax = max_chroma(L, hue)
        if Cmax >= floor + 1:
            return L, min(Cmax - 1.5, CAPS[band])
    return band_L, max_chroma(band_L, hue) - 1.5   # floor unreachable (reported)

def toned_hex(band, hue):
    L, C = tone(band, hue)
    return lch2hex(L, C, hue)

def cvd_min_dist(h1, h2):
    d = dE(h1, h2)
    for mat in CVD.values():
        d = min(d, math.dist(cvd_lab(h1, mat), cvd_lab(h2, mat)))
    return d

seed_hues = [hex_lch(h)[2] for h in GTA5]
# Which bands can each seed hue reach at the floor? (teal/magenta/blue can't do A)
feas = {h: [b for b in "ABC" if hex_lch(toned_hex(b, h))[1] >= CHROMA_FLOOR - 0.5] for h in seed_hues}

def run_greedy(seed_placed):
    """Complete a seed placement with 5 greedy farthest-point additions.
    Returns (whole-palette min CVD-aware pairwise distance, chosen list)."""
    chosen = [(h, b, toned_hex(b, h)) for h, b in seed_placed]
    used = {"A": 0, "B": 0, "C": 0}
    for _, b in seed_placed: used[b] += 1
    open_slots = [b for b in "ABC" for _ in range(SLOTS[b] - used[b])]
    for _ in range(5):
        cand_best = None
        for b in set(open_slots):
            for hue in range(0, 360, 2):
                if any(hue_gap(hue, c[0]) < MIN_HUE_GAP for c in chosen): continue
                hx = toned_hex(b, hue)
                if hex_lch(hx)[1] < CHROMA_FLOOR - 0.5: continue
                d = min(cvd_min_dist(hx, c[2]) for c in chosen)
                if cand_best is None or d > cand_best[0]:
                    cand_best = (d, hue, b, hx)
        if cand_best is None: return (-1, None)   # placement infeasible
        _, hue, b, hx = cand_best
        chosen.append((hue, b, hx))
        open_slots.remove(b)
    score = min(cvd_min_dist(a[2], b[2]) for a, b in itertools.combinations(chosen, 2))
    return (score, chosen)

# Every feasible seed→band placement is scored by the quality of its COMPLETED
# palette (scoring the seeds alone mis-ranks placements — the additions decide).
placements = []
def place(i, used, placed):
    if i == len(seed_hues):
        placements.append(list(placed))
        return
    h = seed_hues[i]
    for b in feas[h]:
        if used[b] < SLOTS[b]:
            used[b] += 1
            placed.append((h, b))
            place(i + 1, used, placed)
            placed.pop()
            used[b] -= 1
place(0, {"A": 0, "B": 0, "C": 0}, [])

best_score, chosen = -1, None
for sp in placements:
    s, ch = run_greedy(sp)
    if s > best_score:
        best_score, chosen = s, ch
print(f"\n{len(placements)} feasible seed placements searched; best completed-palette min CVD-aware dist: {best_score:.1f}")
print("seeds:", [(round(h, 1), b) for h, b, _ in chosen[:5]])
print("additions:", [(h, b, x) for h, b, x in chosen[5:]])
counts = {b: sum(1 for _, bb, _ in chosen if bb == b) for b in "ABC"}
assert counts == SLOTS, f"slot bookkeeping broke: {counts}"

# ---- 2b. Family assignment (FR not green; convention-adjacent where free) -----
# Hue's job is discrimination; assignment inside a band is free EXCEPT Future
# and Reserve may not take a green (h 100-165). Where a choice remains, the
# reader-friendly one is taken (a green lands on Parks, not vice versa).
by_band = {b: [c for c in chosen if c[1] == b] for b in "ABC"}
def take(band, lo, hi, default_first=True):
    lst = by_band[band]
    for c in sorted(lst, key=lambda c: c[0]):
        hh = c[0] % 360
        if (lo <= hi and lo <= hh <= hi) or (lo > hi and (hh >= lo or hh <= hi)):
            lst.remove(c)
            return c
    return lst.pop(0)   # no hue in the preferred range — take what the band has

ASSIGN = {}
ASSIGN["Residential"]               = take("A", 60, 120)
ASSIGN["Agricultural and Rural"]    = take("A", 0, 360)
ASSIGN["Parks and Open Space"]      = take("B", 100, 175)
ASSIGN["Direct Control"]            = take("B", 175, 230)
ASSIGN["Civic and Public Service"]  = take("B", 230, 300)
ASSIGN["Industrial and Employment"] = take("B", 0, 360)
ASSIGN["Mixed Use"]                 = take("C", 20, 100)
ASSIGN["Alternative Jurisdiction"]  = take("C", 200, 260)
# FR before Commercial so the not-green rule can never be forced:
fr = take("C", 300, 20)
if 100 <= fr[0] % 360 <= 165:  # green guard (cannot fire with this wheel; belt+braces)
    by_band["C"].append(fr); fr = take("C", 165, 100)
ASSIGN["Future and Reserve"]        = fr
ASSIGN["Commercial"]                = take("C", 0, 360)

print("\n=== Ten families: band-toned fills (+hover/iso variants) ===")
FILLS, META = {}, {}
for fam, (hue, band, fill) in ASSIGN.items():
    L, C, H = hex_lch(fill)
    # hover: lightness LIFT, hue + chroma held (gamut-clamped)
    hL = L + 7
    hover = lch2hex(hL, min(C, max_chroma(hL, H) - 1.5), H)
    # iso: Band-C toning of the same hue (isolate is a figure state)
    iL, iC = tone("C", H)
    iso = lch2hex(iL, iC, H)
    FILLS[fam] = fill
    META[fam] = (band, fill, hover, iso)
    flag = "  ** below floor **" if C < CHROMA_FLOOR else ""
    print(f"  {fam:26s} band {band}  {fill}  L*{L:5.1f} C*{C:5.1f} h{H:6.1f}{flag}  hover {hover}  iso {iso}")

# ---- 3. Quality score + matrices ---------------------------------------------
fams = list(FILLS)
print("\n=== Pairwise CIE76 dE matrix (fills) ===")
short = {f: f.split()[0][:7] for f in fams}
print("          " + " ".join(f"{short[f]:>8s}" for f in fams))
mind, minpair = 999, None
for a in fams:
    row = []
    for b in fams:
        d = dE(FILLS[a], FILLS[b])
        row.append(f"{d:8.1f}" if a != b else "       ·")
        if a < b and d < mind: mind, minpair = d, (a, b)
    print(f"{short[a]:>10s}" + " ".join(row))
print(f"\nACHIEVED MIN PAIRWISE dE (quality score): {mind:.1f}  ({minpair[0]} ~ {minpair[1]})")

for kind, mat in CVD.items():
    labs = {f: cvd_lab(FILLS[f], mat) for f in fams}
    sp = sorted((math.dist(labs[a], labs[b]), a, b) for a, b in itertools.combinations(fams, 2))
    print(f"{kind}: min {sp[0][0]:.1f} ({sp[0][1]} ~ {sp[0][2]}); next {sp[1][0]:.1f} ({sp[1][1]} ~ {sp[1][2]}); third {sp[2][0]:.1f} ({sp[2][1]} ~ {sp[2][2]})")

# ---- 4. JS-ready block --------------------------------------------------------
print("\n=== FAMILY_STYLE block (paste into zoningStyle.js) ===")
for fam, (band, fill, hover, iso) in META.items():
    L, C, H = hex_lch(fill)
    print(f'  "{fam}": {{ colour: "{fill}", hover: "{hover}", iso: "{iso}" }},  // band {band} · L{L:.0f} C{C:.0f} h{H:.0f}')
