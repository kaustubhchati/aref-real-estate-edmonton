// =============================================================================
// LclqMethodBox.jsx
//
// View 2's LEFT column — the LCLQ method box. STATIC, descriptive, always-open: the
// method IS the point of the view (BC_frontend_spec §2 amendment; PA_MODE_CONTRACT
// Principle 0 — a fixed reference frame, no controls, so it does not compete with the
// console for interaction space). It names + explains the estimator: this is an
// academic site (the §2.4 "never says LCLQ / never a p-value" ruling is retired here).
//
// The math is transcribed from KC's ACTUAL R implementation
// (04_build_mapping_frame.R:716-794), NOT a reconstruction — the displayed formula is
// the one the shipped numbers came from:
//   LCLQ_{A,i} = ( Σ_{j∈N_k(i)} w_ij · 1[c_j = A] ) / ( N_A / (N-1) )
//   • N_k(i): k=10 nearest neighbours (kNN, SELF EXCLUDED; Euclidean in EPSG:26912)
//   • w_ij:   Gaussian ADAPTIVE kernel weight        • c_j: neighbour's industry group
//   • N_A:    citywide count of group A              • N = 29,894
//   Significance = conditional permutation (999 shuffles, labels reshuffled with
//   locations fixed), BH-FDR across all tested, BINARY gate q < 0.05. min group n = 30.
//
// KaTeX (0.16.x) renders ONCE at mount with MathML output ON (default htmlAndMathml —
// visual HTML + screen-reader MathML). New sanctioned dependency (DESIGN_SYSTEM §4a).
// =============================================================================

import { useEffect, useRef } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

// From the R: numerator = kernel-weighted same-group neighbour count; denominator = the
// citywide expected share N_A/(N-1). \mathbf{1} is the indicator over neighbour label = A.
const FORMULA = String.raw`\operatorname{LCLQ}_{A,i}=\frac{\displaystyle\sum_{j\,\in\,N_k(i)} w_{ij}\,\mathbf{1}\!\left[c_j = A\right]}{N_A \,/\, (N-1)}`;

// Interpretation as a braced piecewise cases block (terse labels so it fits the 268px column;
// the fuller reading is in the lead + significance prose below).
const CASES = String.raw`\operatorname{LCLQ}\begin{cases} >1 & \text{clustered} \\[2pt] =1 & \text{as random} \\[2pt] <1 & \text{dispersed} \end{cases}`;

const PARAMS = [
  ["Neighbourhood", "k = 10 nearest (kNN, self excluded)"],
  ["Weighting", "Gaussian adaptive kernel"],
  ["Distance", "Euclidean, UTM 12N (EPSG:26912)"],
  ["Null model", "999 conditional permutations"],
  ["Correction", "Benjamini–Hochberg FDR"],
  ["Estimated at", "industry group; ≥ 30 businesses"],
];

export default function LclqMethodBox() {
  const formulaRef = useRef(null);
  const casesRef = useRef(null);
  useEffect(() => {
    const opts = { throwOnError: false, displayMode: true, output: "htmlAndMathml" };
    if (formulaRef.current) katex.render(FORMULA, formulaRef.current, opts);
    if (casesRef.current) katex.render(CASES, casesRef.current, opts);
  }, []);

  return (
    <div className="bc-method">
      <span className="pa-col-lab">Local Colocation Quotient</span>
      <p className="bc-method-lead">
        For each business: is its own trade over-represented among its nearest neighbours,
        against the citywide base rate?
      </p>
      <div className="bc-method-formula" ref={formulaRef} aria-label="LCLQ formula" />
      <div className="bc-method-cases" ref={casesRef} aria-label="How to read the value" />

      <dl className="bc-method-params">
        {PARAMS.map(([k, v]) => (
          <div className="bc-method-param" key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>

      <p className="bc-method-sig">
        <strong>Binary finding</strong> — significant or not, at the FDR gate
        (q&nbsp;&lt;&nbsp;0.05). <strong>The multiplier grades strength</strong>, not a p-value.
      </p>
      <p className="bc-method-cite">
        Leslie &amp; Kronenfeld (2011), <em>Geographical Analysis</em> 43 · Wang et&nbsp;al.
        (2017), <em>The Professional Geographer</em> 69(1)
      </p>
    </div>
  );
}
