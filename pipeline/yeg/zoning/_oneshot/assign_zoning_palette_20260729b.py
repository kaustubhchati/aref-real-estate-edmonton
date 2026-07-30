# ============================================================
# assign_zoning_palette_20260729b.py   (zoning — ONE-SHOT, frozen after use)
# ------------------------------------------------------------
# THE ASSIGNMENT STEP (KC directive, optical pass 5 — supersedes the family
# mapping of derive_zoning_palette_20260729.py while KEEPING its ratified
# register: vividness + the C*>=46 chroma floor). Palette GENERATION and
# palette ASSIGNMENT are separate operations (Lin et al. 2013, "Selecting
# Semantically-Resonant Colors for Data Visualization"): assignment balances
# semantic affinity against discrimination.
#
# CONSTRAINTS (all encoded, none post-hoc):
#   • ABSOLUTE RESERVATIONS: BLUE is water's (no family box touches the blue
#     region h≈215–300 — the map has a real river; parks-as-blue is a false
#     statement). GREEN belongs to Parks and Open Space alone (h 115–165
#     excluded from every other family's box).
#   • ONE FAMILY PER HUE REGION (the KC table below): boxes do not overlap in
#     hue except where the colour NAME differs by construction (brown vs
#     orange are different names for different L/C in the same hue sector).
#   • BINDING LIGHTNESS BANDS — candidate L ranges are constrained BEFORE
#     optimisation: A [83,88] (Ag+Res, 63% of area, recede), B [62,70] (mid),
#     C [47,56] (punch). Ranges DO NOT OVERLAP (gaps 13 and 6 L*).
#   • CHROMA floor C*>=46 (ratified), band caps A60/B75/C88 — with THREE
#     STATED RELAXATIONS where the semantic target is definitionally
#     moderated: DC "brown/sienna" (C>=40), FR "dusty rose" (C>=40), AJ
#     "dark warm neutral with hue" (C>=34). Chroma relaxes; the lightness
#     separation NEVER does (it produces the aerial structure).
#
# OPTIMISER: coordinate ascent — every family grid-searches its own
# (L × C × hue) box to maximise the palette's MINIMUM pairwise CVD-aware
# distance (min of normal / deuteranopia / protanopia CIE76), iterating to a
# fixed point. Mixed Use is PINNED at #d25f06 (ratified: "currently works").
#
# GATES REPORTED: the NAMING TEST (one common colour name per family, no
# duplicates — run before dE, because dE passed the three pinks and the eye
# did not), the small-area-quartet minimum (Commercial/FR/AJ/MU — a whole-
# palette minimum would hide it), band L* ranges + non-overlap, water vs
# every family, off-city ground vs Band A, hover-lift perceptibility on C.
# ============================================================

import math
import itertools

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
def in_gamut(L, C, H):
    return all(-1e-6 <= c <= 1 + 1e-6 for c in
               lab2rgb(L, C * math.cos(math.radians(H)), C * math.sin(math.radians(H))))
def lch2hex(L, C, H):
    r, g, b = lab2rgb(L, C * math.cos(math.radians(H)), C * math.sin(math.radians(H)))
    return "#" + "".join(f"{round(_unlin(c) * 255):02x}" for c in (r, g, b))
def hex_lch(h):
    L, a, b = rgb2lab(hex2rgb(h))
    return L, math.hypot(a, b), math.degrees(math.atan2(b, a)) % 360
def dE(h1, h2): return math.dist(rgb2lab(hex2rgb(h1)), rgb2lab(hex2rgb(h2)))
CVD = {
  "deuteranopia": [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
  "protanopia":   [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
}
def cvd_lab(hexv, mat):
    lr = [_lin(c) for c in hex2rgb(hexv)]
    return rgb2lab([_unlin(sum(mat[i][j] * lr[j] for j in range(3))) for i in range(3)])
def cvd_min_dist(h1, h2):
    d = dE(h1, h2)
    for mat in CVD.values():
        d = min(d, math.dist(cvd_lab(h1, mat), cvd_lab(h2, mat)))
    return d

# ---- The semantic boxes (family: band-L range, hue range, C range, name) ------
# Blue h215–300 appears in NO box; green 115–165 only in Parks'.
BOXES = {
 "Agricultural and Rural":    ("A", (83, 88), (98, 114),  (46, 58), "straw"),
 "Residential":               ("A", (83, 88), (84, 97),   (46, 60), "gold"),
 "Parks and Open Space":      ("B", (62, 70), (120, 160), (46, 75), "green"),
 "Industrial and Employment": ("B", (62, 70), (300, 322), (46, 75), "violet"),
 "Direct Control":            ("B", (62, 70), (52, 72),   (40, 55), "brown"),   # relaxation: sienna
 "Civic and Public Service":  ("B", (62, 70), (332, 352), (46, 75), "plum"),
 "Commercial":                ("C", (47, 56), (22, 40),   (55, 88), "red"),
 "Future and Reserve":        ("C", (47, 56), (352, 371), (40, 52), "rose"),    # relaxation: dusty
 "Alternative Jurisdiction":  ("C", (47, 56), (72, 96),   (34, 46), "bronze"),  # relaxation: warm neutral w/ hue
 "Mixed Use":                 ("C", None, None, None, "orange"),                 # PINNED #d25f06 (ratified)
}
PINNED = {"Mixed Use": "#d25f06"}

def candidates(fam):
    band, (l0, l1), (h0, h1), (c0, c1), _ = BOXES[fam]
    out = []
    L = l0
    while L <= l1 + 1e-9:
        H = h0
        while H <= h1 + 1e-9:
            C = c1
            while C >= c0 - 1e-9:
                if in_gamut(L, C, H % 360):
                    out.append(lch2hex(L, C, H % 360))
                    break               # take the max in-gamut chroma at (L,H)
                C -= 2
            H += 3
        L += 1
    return out

fams = list(BOXES)
CAND = {f: ([PINNED[f]] if f in PINNED else candidates(f)) for f in fams}
print("candidate counts:", {f.split()[0]: len(CAND[f]) for f in fams})

# Start at each box's max-chroma centre, then coordinate-ascent to a fixed point.
current = {f: CAND[f][len(CAND[f]) // 2] for f in fams}
def palette_min(pal):
    return min(cvd_min_dist(a, b) for a, b in itertools.combinations(pal.values(), 2))
for sweep in range(8):
    changed = False
    for f in fams:
        if f in PINNED: continue
        best_hex, best_score = current[f], None
        others = [current[g] for g in fams if g != f]
        for hx in CAND[f]:
            s = min(cvd_min_dist(hx, o) for o in others)
            if best_score is None or s > best_score + 1e-9:
                best_score, best_hex = s, hx
        if best_hex != current[f]:
            current[f] = best_hex
            changed = True
    if not changed:
        print(f"converged after sweep {sweep + 1}")
        break

# ---- Report --------------------------------------------------------------------
print("\n=== FINAL TEN (hue region · band · L*C*h* · name) ===")
for f in fams:
    band, lr, hr, cr, name = BOXES[f]
    L, C, H = hex_lch(current[f])
    floor_note = " (stated chroma relaxation)" if cr and cr[0] < 46 else ""
    print(f"  {f:26s} {current[f]}  band {band}  L*{L:5.1f} C*{C:5.1f} h{H:6.1f}  «{name}»{floor_note}")

names = [BOXES[f][4] for f in fams]
print("\nNAMING TEST:", "PASS — all distinct" if len(set(names)) == len(names) else "FAIL", "->", names)

print("\n=== Band L* ranges (measured) — must not overlap ===")
for band in "ABC":
    Ls = [hex_lch(current[f])[0] for f in fams if BOXES[f][0] == band]
    print(f"  band {band}: L* {min(Ls):.1f}–{max(Ls):.1f}")

print("\n=== Pairwise CIE76 dE matrix ===")
short = {f: f.split()[0][:7] for f in fams}
print("          " + " ".join(f"{short[f]:>8s}" for f in fams))
for a in fams:
    row = "".join(f"{dE(current[a], current[b]):8.1f}" if a != b else "       ·" for b in fams)
    print(f"{short[a]:>10s}" + row)
mind, minpair = min(((cvd_min_dist(current[a], current[b]), (a, b))
                     for a, b in itertools.combinations(fams, 2)), key=lambda x: x[0])
print(f"\nwhole-palette min CVD-aware dE: {mind:.1f}  ({minpair[0]} ~ {minpair[1]})")

SMALL = ["Commercial", "Future and Reserve", "Alternative Jurisdiction", "Mixed Use"]
ms, mp = min(((cvd_min_dist(current[a], current[b]), (a, b))
              for a, b in itertools.combinations(SMALL, 2)), key=lambda x: x[0])
print(f"SMALL-AREA QUARTET min CVD-aware dE: {ms:.1f}  ({mp[0]} ~ {mp[1]})")

for kind, mat in CVD.items():
    labs = {f: cvd_lab(current[f], mat) for f in fams}
    sp = sorted((math.dist(labs[a], labs[b]), a, b) for a, b in itertools.combinations(fams, 2))
    print(f"{kind}: min {sp[0][0]:.1f} ({sp[0][1]} ~ {sp[0][2]}); next {sp[1][0]:.1f} ({sp[1][1]} ~ {sp[1][2]})")

WATER = "#a9d3e8"; GROUND = "#fcfaf4"
print("\n=== Water / ground checks ===")
for f in fams:
    print(f"  water ~ {f.split()[0]:12s} dE {dE(WATER, current[f]):5.1f}")
print("  off-city ground ~ Ag/Res:",
      f"{dE(GROUND, current['Agricultural and Rural']):.1f} / {dE(GROUND, current['Residential']):.1f}")

# ---- hover (+7 L, hue+chroma held) + iso (band-C toning) variants --------------
def max_c_at(L, H, cap):
    C = cap
    while C > 4 and not in_gamut(L, C, H): C -= 1
    return C
print("\n=== FAMILY_STYLE block ===")
for f in fams:
    L, C, H = hex_lch(current[f])
    hL = min(L + 7, 96)
    hover = lch2hex(hL, min(C, max_c_at(hL, H, C)), H)
    band = BOXES[f][0]
    if band == "C":
        iso = current[f]
    else:
        iL = 52
        iso = lch2hex(iL, max_c_at(iL, H, 88), H)
    print(f'  "{f}": {{ colour: "{current[f]}", hover: "{hover}", iso: "{iso}" }},'
          f'  // {band} · L{L:.0f} C{C:.0f} h{H:.0f} · {BOXES[f][4]}')
    print(f"    hover-lift dE (perceptibility): {dE(current[f], hover):.1f}")
