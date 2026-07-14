// =============================================================================
// InfoRail.jsx
//
// The Property Assessment single-select DETAIL instrument (S-b / View mode,
// contract §4/C9). PropertyAssessmentMap renders it as a right-side float below
// the nav stack ONLY when exactly one neighbourhood is selected and the console
// is down. Dark annex anatomy, top to bottom:
//   name · rank/parcels/state · active-metric sparkline · value/city/delta triplet
//   · hairline · condo block (Condo share / Mean excl. condo / Lot non-condo).
// A suppressed / non-reportable single-select shows its state label + honest
// em-dashes (never a false zero).
//
// Reuse, not rebuild: reads the SAME projected feature the map paints + the shared
// cityBaseline aggregate (so it can't drift), and the shared Sparkline. No app
// state of its own.
// =============================================================================

import Sparkline from "../../components/Sparkline.jsx";
import { METRICS, STATE_STYLE, COLOUR_LEVEL_DELTAS } from "./choroplethStyle.js";
import { fmtNumber, fmtCurrencyShort } from "../../utils/format.js";

// Plain-language reason for a non-aggregated polygon, keyed by polygon_state.
const STATE_NOTE = {
  suppressed_low_n:
    "Fewer than 100 properties — aggregate values suppressed to protect privacy.",
  non_residential:
    "No residential properties in this area. May include river valley, industrial zones, parks, or commercial-only land.",
  manufactured_home_community:
    "Manufactured home community. Lot sizes are not recorded for leased-land properties.",
  no_data:
    "No assessment data for this boundary. Area may be unregistered, recently annexed, or a planning placeholder.",
};

// Which cityBaseline field is the comparison baseline for each metric (lot/built have
// none). The median & YoY baselines are approximate → prefixed "≈".
const CITY_KEY = { median_assessvalue: "medianOfMedians", avall_public: "parcelMean", yoy_pct_change: "areaYoY" };
const APPROX = new Set(["median_assessvalue", "yoy_pct_change"]);
const TREND_METRICS = new Set(["median_assessvalue", "avall_public", "yoy_pct_change"]);

const num = (v) => (v == null || !Number.isFinite(+v) || +v === -999 ? null : +v);
const signCls = (n) => (n > 0 ? "dt-up" : n < 0 ? "dt-dn" : "");
const signedPct = (r) => (r >= 0 ? "+" : "") + Math.round(r * 100) + "%";
const signedPp = (d) => (d >= 0 ? "+" : "") + d.toFixed(1) + "pp";
const pctText = (x) => (x == null ? "—" : `${Math.round(x)}%`);

export default function InfoRail({
  feature,      // projected (bare-named) properties of the selected nbhd, active year
  metric,       // active metric key — the sparkline series + the triplet
  sparkValues,  // active metric across the years for this nbhd (null = gap)
  activeIndex,  // index of the active year (dots the sparkline)
  cityBaseline, // the shared parcel-weighted city aggregate (for the triplet's city + delta)
  cityName,     // active city name (e.g. "Edmonton") — labels the CITY triplet cell (C3)
  rank,         // this nbhd's city rank by the active metric (from the table rows)
  onClear,      // () => void — clear the selection
}) {
  const state = feature.polygon_state;
  const meta = STATE_STYLE[state] || { label: state };
  const activeMetric = METRICS.find((m) => m.key === metric) ?? METRICS[0];
  const activeVal = num(feature[activeMetric.key]);
  // C2 — the chrome shows COMPACT figures (full precision is for Export): the $ metrics
  // use the short currency formatter, everything else keeps its own formatter.
  const chromeFmt = (v) =>
    (metric === "median_assessvalue" || metric === "avall_public")
      ? fmtCurrencyShort(v)
      : activeMetric.fmt(v);
  const parcels = num(feature.n_properties);

  // Sparkline trajectory colour (median/mean/YoY → rising green / falling coral;
  // lot/built → neutral).
  const sv = (sparkValues ?? []).map(num);
  const svFinite = sv.filter((v) => v != null);
  let stroke = "var(--pa-dim)";
  if (TREND_METRICS.has(metric) && svFinite.length >= 2) {
    const dir = svFinite[svFinite.length - 1] - svFinite[0];
    stroke = dir > 0 ? "var(--pa-up)" : dir < 0 ? "var(--pa-dn)" : "var(--pa-dim)";
  }

  // Active-metric triplet: value · city baseline · delta (level → relative %, YoY → pp;
  // lot/built have no city baseline → value only).
  const cityVal = num(cityBaseline?.[CITY_KEY[metric]]);
  let delta = null;
  if (cityVal != null && activeVal != null) {
    if (metric === "yoy_pct_change") delta = { txt: signedPp(activeVal - cityVal), cls: signCls(activeVal - cityVal) };
    else if (cityVal !== 0) delta = { txt: signedPct((activeVal - cityVal) / cityVal), cls: COLOUR_LEVEL_DELTAS ? signCls(activeVal - cityVal) : "" };
  }
  const cityText = cityVal == null ? "—" : (APPROX.has(metric) ? "≈" : "") + chromeFmt(cityVal);

  // This nbhd's condo figures.
  const condo = num(feature.pct_with_unit);
  const mexcl = num(feature.avg_assessvalue_without_unit);
  const lot = num(feature.avg_lotsize);

  const aggregated = state === "aggregated";

  return (
    <div className="pa-detail" aria-label="Neighbourhood detail" aria-live="polite">
      <div className="pa-detail-head">
        <h2 className="pa-detail-name">{feature.display_name}</h2>
        <button type="button" className="pa-detail-clear" onClick={onClear}
                aria-label="Clear selection" title="Clear selection">✕</button>
      </div>
      {/* Rank in a FIXED SLOT under the name (Principle 0) — rank ONLY. The parcel
          count moves into the stat stack below (Fix A1); the `reportable` status
          descriptor is dropped as noise. Suppressed / non-residential / no-data states
          still surface their honesty label via STATE_NOTE below (§6 — honesty labels
          never stripped), so nothing meaningful is lost by removing `reportable` here. */}
      <p className="pa-detail-sub">Rank {rank != null ? rank : "—"}</p>

      {/* Annexation-area note (Tier 2 · sub-concern E) — orthogonal to the state
          above; a polygon can be annexation-area AND aggregated. Agrees with the
          legend's teal outline row. */}
      {feature.is_annexation_area && (
        <p className="pa-detail-note">
          Annexation area — annexed, not yet subdivided into neighbourhoods; shown with its own outline.
        </p>
      )}

      {aggregated && sparkValues && (
        <Sparkline values={sv} stroke={stroke} width={196} height={26}
                   activeIndex={activeIndex} ariaLabel={`${activeMetric.label} trend`} />
      )}

      {/* D-F5 — the active metric's Value LEADS via weight + a size step only (NOT a semantic
          colour: §1.3 reserves blue for City and up/down for Delta). City + Delta keep those
          mandatory colours but sit in the smaller/muted tier around the lead. */}
      <div className="pa-detail-trip">
        <div>
          <div className="pa-trip-l">Value</div>
          <div className={`pa-trip-v pa-trip-lead${aggregated ? "" : " pa-trip-muted"}`}>
            {aggregated && activeVal != null ? chromeFmt(activeVal) : "—"}
          </div>
        </div>
        <div>
          <div className="pa-trip-l">{cityName ?? "City"}</div>
          <div className="pa-trip-v pa-trip-city">{cityText}</div>
        </div>
        <div>
          <div className="pa-trip-l">Delta</div>
          <div className={`pa-trip-v ${aggregated ? (delta?.cls ?? "") : ""}`}>
            {aggregated ? (delta?.txt ?? "—") : "—"}
          </div>
        </div>
      </div>

      {aggregated ? (
        <div className="pa-detail-condo">
          {/* Parcels (N) leads the stat stack (Fix A1) — relocated from the old name/rank
              chip line into the governed stack: label --tx-mut, value --tx + tabular-nums. */}
          <div className="pa-kv"><span className="pa-kv-k">Parcels (N)</span><span className="pa-kv-v">{parcels != null ? fmtNumber(parcels) : "—"}</span></div>
          <div className="pa-kv"><span className="pa-kv-k">Condo share</span><span className="pa-kv-v">{pctText(condo)}</span></div>
          <div className="pa-kv"><span className="pa-kv-k">Mean excl. condo</span><span className="pa-kv-v">{mexcl != null ? fmtCurrencyShort(mexcl) : "—"}</span></div>
          <div className="pa-kv"><span className="pa-kv-k">Lot (non-condo)</span><span className="pa-kv-v">{lot != null ? `${Math.round(lot)} m²` : "—"}</span></div>
        </div>
      ) : (
        <>
          {/* Non-aggregated: keep the parcel count when the neighbourhood has one
              (suppressed_low_n) so it isn't lost with the chip line; the state's honesty
              note follows. Non-residential / no-data have no residential parcels → note only. */}
          {parcels != null && parcels > 0 && (
            <div className="pa-detail-condo">
              <div className="pa-kv"><span className="pa-kv-k">Parcels (N)</span><span className="pa-kv-v">{fmtNumber(parcels)}</span></div>
            </div>
          )}
          <p className="pa-detail-note">{STATE_NOTE[state] ?? meta.label}</p>
        </>
      )}
    </div>
  );
}
