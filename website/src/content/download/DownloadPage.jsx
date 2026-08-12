// =============================================================================
// DownloadPage.jsx
//
// Lists all publicly released CSV datasets for direct download.
// Data-driven from siteConfig.downloads — adding a new dataset is
// one entry in siteConfig.js, no JSX change needed.
//
// Year-bearing bits (label year, filename year, coverage spans, year counts)
// are TEMPLATES in siteConfig with {year}/{span}/{recentSpan}/{yearCount}
// tokens. We fill them here from the backend manifests the entry's `source`
// names — "assessment" → PA /manifest.json, "permits" → the BP manifest — so
// the page rolls forward on the next refresh with no edit to siteConfig.
//
// Layout: section header + card grid. Each card has a CSV icon,
// label, description, metadata row (size / rows / section / year),
// and a Download button anchoring the static file in /public/downloads/.
// =============================================================================

import { useEffect, useState } from "react";

import { siteConfig } from "../../config/siteConfig.js";
import { assetUrl } from "../../utils/assetUrl.js";
import { loadManifest, getDefaultYear } from "../property-assessment/dataSources.js";
import { loadPermitManifest, permitYears, permitDefaultYear } from "../building-permits/dataSources.js";

// Replace {token}s in a template from a per-source value map. An unknown token
// is left as-is so a typo is visible rather than silently dropped.
function fill(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : `{${k}}`));
}

// Minimal inline SVG CSV icon — file-table shape with CSV text.
// No external dependency; renders at 32×40px.
function CsvIcon({ colour = "var(--accent)" }) {
  return (
    <svg
      width="32" height="40"
      viewBox="0 0 32 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* File body */}
      <rect x="1" y="1" width="30" height="38"
        rx="3" ry="3"
        fill="var(--bg)" stroke={colour} strokeWidth="1.5"
      />
      {/* Folded corner */}
      <path d="M20 1 L31 12 L20 12 Z"
        fill={colour} opacity="0.15"
      />
      <path d="M20 1 L20 12 L31 12"
        stroke={colour} strokeWidth="1.5"
        fill="none"
      />
      {/* CSV label */}
      <text
        x="16" y="28"
        textAnchor="middle"
        fontSize="9"
        fontWeight="700"
        fontFamily="ui-monospace, Menlo, Consolas, monospace"
        fill={colour}
        letterSpacing="0.5"
      >
        CSV
      </text>
    </svg>
  );
}

export default function DownloadPage() {
  const { downloads } = siteConfig;
  // Token values per source, resolved from the manifests. null until both load.
  const [ctx, setCtx] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadManifest(), loadPermitManifest()])
      .then(([pa, bp]) => {
        if (cancelled) return;
        const bpY = permitYears(bp);
        const bpMin = Math.min(...bpY), bpMax = Math.max(...bpY);
        setCtx({
          assessment: { year: getDefaultYear(pa, "Edmonton") },
          permits: {
            year: permitDefaultYear(bp),
            span: `${bpMin}–${bpMax}`,
            // Geocoding lag is a recent-data effect; describe it as the trailing
            // 3 years (reproduces the old "2024–2026" and rolls forward).
            recentSpan: `${bpMax - 2}–${bpMax}`,
            yearCount: bpY.length,
          },
        });
      })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="shell-main">
      <div style={{ maxWidth: 860, margin: "0 auto" }}>

        {/* Page header */}
        <p className="eyebrow" style={{ marginTop: "2rem" }}>
          Open Data
        </p>
        <h1 style={{
          fontSize: "clamp(1.4rem, 3vw, 2rem)",
          fontWeight: 700,
          letterSpacing: "-0.02em",
          lineHeight: 1.2,
          margin: "0 0 0.5rem",
        }}>
          Download datasets
        </h1>
        <p style={{
          fontSize: "0.95rem",
          color: "var(--text-muted)",
          lineHeight: 1.6,
          margin: "0 0 2rem",
          maxWidth: 560,
        }}>
          Cleaned, analysis-ready CSV files derived from City of
          Edmonton open data. No file contains individual property
          records.
        </p>

        {/* Dataset cards. These ARE a list of datasets, so they are marked up as
            one — a <ul> of <li>s. A screen reader then announces how many there
            are and which one the reader is on; a stack of <div>s announces
            nothing. The loading/error message replaces the whole list rather
            than sitting inside it, because a <p> is not a valid child of <ul>. */}
        {!ctx ? (
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
            {error ? `Could not load the dataset catalogue: ${error}` : "Loading…"}
          </p>
        ) : (
          <ul style={{
            display: "flex",
            flexDirection: "column",
            gap: "1rem",
            listStyle: "none",
            margin: 0,
            padding: 0,
          }}>
            {downloads.map((d) => {
              const v = ctx[d.source];
              // Resolved once: it names the card AND the download link below it.
              const title = fill(d.label, v);
              return (
                <li key={d.id} style={{
                  display: "flex",
                  gap: "1.25rem",
                  alignItems: "flex-start",
                  padding: "1.25rem 1.5rem",
                  background: "var(--bg)",
                  border: "1px solid var(--border-soft)",
                  borderRadius: "var(--radius-lg)",
                  boxShadow: "var(--shadow-sm)",
                }}>

                  {/* CSV icon */}
                  <div style={{ flexShrink: 0, paddingTop: 2 }}>
                    <CsvIcon />
                  </div>

                  {/* Card body */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* The card's title is a real heading (h2, one level under
                        the page h1) so the page has an outline a screen reader
                        can navigate. The inline sizes below are the ones the
                        <p> carried, restated so the heading LOOKS unchanged —
                        an h2's browser defaults would otherwise enlarge it. */}
                    <h2 style={{
                      fontSize: "1rem",
                      fontWeight: 600,
                      color: "var(--text)",
                      margin: "0 0 0.3rem",
                      lineHeight: 1.3,
                    }}>
                      {title}
                    </h2>
                    <p style={{
                      fontSize: "0.85rem",
                      color: "var(--text-muted)",
                      lineHeight: 1.5,
                      margin: "0 0 0.75rem",
                    }}>
                      {fill(d.description, v)}
                    </p>

                    {/* Metadata pills. Also a list, so also a <ul>.
                        Each pill shows a bare value ("2026") next to a glyph
                        that is decorative and hidden from assistive tech — so
                        on its own a pill announces "2026" and means nothing.
                        `field` names what the value IS. It rides in aria-label
                        rather than on screen, because the glyph already tells a
                        sighted reader which field this is, and printing the word
                        too would change what the page displays. */}
                    <ul style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "0.4rem",
                      listStyle: "none",
                      padding: 0,
                      margin: "0 0 0.875rem",
                    }}>
                      {[
                        { icon: "📁", field: "Size", text: d.size },
                        { icon: "⊞", field: "Rows", text: fill(d.rows, v) },
                        { icon: "◎", field: "Section", text: d.section },
                        { icon: "◷", field: "Year", text: String(v.year) },
                      ].map(({ icon, field, text }) => (
                        <li key={text} aria-label={`${field}: ${text}`} style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          fontSize: "0.72rem",
                          color: "var(--text-muted)",
                          background: "var(--bg-soft)",
                          border: "1px solid var(--border-soft)",
                          borderRadius: 999,
                          padding: "2px 9px",
                        }}>
                          <span aria-hidden="true"
                            style={{ fontSize: "0.7rem" }}>
                            {icon}
                          </span>
                          {text}
                        </li>
                      ))}
                    </ul>

                    {/* Download button.
                        The link TEXT names its own file. Three links all reading
                        "Download CSV" are indistinguishable to anyone who meets
                        them out of context — a screen-reader link list, or a
                        keyboard user tabbing through — and the card heading that
                        disambiguates them is not part of the link. Title, then
                        format and size in brackets, is the convention UK
                        government publishing uses for exactly this. The size is
                        the one already shown on the card; nothing new is claimed
                        about the file here. */}
                    <a
                      href={assetUrl(fill(d.file, v))}
                      download
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "6px 16px",
                        fontSize: "0.82rem",
                        fontWeight: 600,
                        fontFamily: "inherit",
                        color: "var(--accent-dark)",
                        background: "var(--accent-soft)",
                        border: "1px solid var(--green-300)",
                        borderRadius: "var(--radius-md)",
                        textDecoration: "none",
                        cursor: "pointer",
                        transition: "background 150ms, border-color 150ms",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background =
                          "var(--green-100)";
                        e.currentTarget.style.borderColor =
                          "var(--accent)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background =
                          "var(--accent-soft)";
                        e.currentTarget.style.borderColor =
                          "var(--green-300)";
                      }}
                    >
                      {/* Down-arrow download icon (inline SVG) */}
                      <svg width="13" height="13"
                        viewBox="0 0 13 13" fill="none"
                        aria-hidden="true">
                        <path d="M6.5 1v8M3 6.5l3.5 3.5 3.5-3.5"
                          stroke="currentColor" strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path d="M1 11h11"
                          stroke="currentColor" strokeWidth="1.6"
                          strokeLinecap="round"
                        />
                      </svg>
                      {`${title} (CSV, ${d.size})`}
                    </a>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* Footer note */}
        <p style={{
          fontSize: "0.78rem",
          color: "var(--text-muted)",
          lineHeight: 1.55,
          margin: "2rem 0 3rem",
          padding: "1rem",
          background: "var(--bg-soft)",
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--border-soft)",
        }}>
          <strong>Data source:</strong> City of Edmonton Open Data.
          All files are derived from public records. Cleaning rules
          and suppression thresholds differ by dataset and are stated
          with each file above.
          Raw source data is available at{" "}
          <a
            href="https://data.edmonton.ca"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--accent)" }}
          >
            data.edmonton.ca
          </a>.
        </p>

      </div>
    </div>
  );
}
