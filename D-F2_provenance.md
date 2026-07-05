# D-F2 — YoY legend provenance (GATED report, no code)

**Question:** which build produced the reported YoY legend "+22.3% … +144.7%" (2023) /
"+31.7% … +85.3%" (2021)? **Answer: none in the repo — it is a phantom.**

## Conclusion: (e) NOT reproducible anywhere in git

- **Legend logic never existed on the main line.** Every committed YoY scale, from the first
  YoY commit (`29fc3dc`, fixed ±15) through `f2823f3` (Jun 26 — introduced the global
  `yoyStopsFromValues`: E = p98(|yoy|) across ALL nbhd-years, symmetric) to HEAD
  (`YOY_FALLBACK_E = 15.5`), is **zero-centred, symmetric, and clamped at ±E**. The Legend's
  left end label is always `format(−E)` (negative). So `main` structurally **cannot** render a
  positive low endpoint or the raw per-year max — those are deliberately clamped off.
- **Clean tree, no stash, no branch, matching dist.** `choroplethStyle.js` / `PropertyAssessmentMap.jsx`
  / `Legend.jsx` unmodified vs HEAD; `git stash list` empty; all YoY-named branches are ancestors
  of `main` with no per-year domain; on-disk `website/dist/` (untracked) matches current `main`'s
  global-p98 logic. Working-tree grep finds no `144.7` / `85.3` / `22.3` / `31.7` anywhere.

## Data vintage IS pinned (the one firm sub-finding)

The reported HIGHS (144.7 / 85.3) are the per-year **raw maxima** of the **matched-log** YoY data —
which first appears at `0b88323` ("republish matched-log YoY", ~Jun 26) and is the SAME data on
current `main`:

| Vintage | 2023 max | 2021 max |
|---|---|---|
| pre-matched-log (full-pop-raw) | 324.9 | 121.1 |
| `0b88323` matched-log onward … HEAD | **144.7** ✅ | **85.3** ✅ |

So the screenshot used current-era data — but rendered it through a legend formula that was never
committed. The positive LOWS (+22.3 / +31.7) match **no** statistic of the data in any vintage
(+31.7 sits in an empty 2021 gap: 2nd-highest value is 10.5, then a lone 85.3) — a computed bound
from an unknown, unrecoverable formula.

## Most defensible inference (labelled inference)

A **transient, uncommitted intermediate draft** of the `f2823f3` work (Fri Jun 26): that commit's
message documents the author iterating on data-derived endpoints and *rejecting* alternatives before
settling on the global symmetric p98 that shipped. A pre-commit draft computing **per-year** endpoints
would yield per-year highs = per-year max (144.7 / 85.3). The formula for the positive lows did not
survive into any commit.

## Recommendation

**Treat the reported D-F2 defect as a phantom — do not chase it** (KC's rule: "if the defect isn't in
production, we do not chase a phantom"). The severe washout is NOT on `main`.

**However, a MILD real residual exists on `main`** (verified separately, KC-side): the global E = 15.5
is a cross-year compromise — ~2.5× wider than calm years need (per-year p98: 2020≈9, 2021≈8) so genuine
±5–8 % moves render pale, while 2025 (per-year p98 = 108, 7 nbhds > +50 %) has several nbhds clamped to
full red. This is a discretionary legibility polish, **not** a defect fix. If KC wants it, the earlier
two-part plan applies (per-year robust p2/p98 clamp for the scale; optional thin-matched-base suppression
for value honesty, which needs the un-emitted `n_matched` column) — as an improvement scoped against
`main`, with a METHODOLOGY entry. Default per KC's rule: **drop / park D-F2.**
