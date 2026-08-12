# =============================================================================
# _suppression_rule.R — the reporting threshold, defined once
# -----------------------------------------------------------------------------
# WHAT THIS IS
#   The minimum number of residential properties a neighbourhood must contribute
#   before its aggregate values are reported. Below it, the row is still
#   published — with its identity and its property count — but every derived
#   value is withheld.
#
# WHY IT IS A FILE OF ITS OWN
#   This number was written out FOUR times in the production chain: the current
#   aggregate and the historical aggregate each suppressed at `< 100`, and the
#   two GeoJSON builders each classified a polygon as reportable at `>= 100`.
#   Four copies of one rule is four chances for them to disagree, and a
#   disagreement would be invisible: the aggregate would withhold a value while
#   the map still coloured the polygon as reportable, or the reverse.
#
#   The immediate reason for extracting it is that the number now has a FIFTH
#   consumer — the published manifest, which states the threshold so the
#   download page can explain suppression without typing the number again. A
#   threshold published from a fifth copy would be worse than publishing none:
#   it would look authoritative while being able to drift from the rule that
#   actually ran.
#
# WHY 100, AND WHY IT DOES NOT MOVE WITH THE DATA
#   It is a domain-justified constant, not a value fitted to any year (§4.3).
#   Small-count aggregates are unstable — a single high-value property moves a
#   median in a neighbourhood of thirty — and they narrow the range a value
#   could belong to, which is the disclosure risk. The threshold is therefore
#   about reliability and privacy, not about the current year's distribution,
#   and it must NOT be recomputed per refresh.
#
# CHANGING IT
#   Change it here and nowhere else. Every consumer reads this file, so a change
#   takes effect across the aggregates, both map builders, and the published
#   manifest in one edit — and they cannot fall out of step.
# =============================================================================

SUPPRESSION_MIN_PROPERTIES <- 100L
