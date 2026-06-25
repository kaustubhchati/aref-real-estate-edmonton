// =============================================================================
// DownloadPage.jsx
//
// Lists all publicly released CSV datasets for direct download.
// Data-driven from siteConfig.downloads — adding a new dataset is
// one entry in siteConfig.js, no JSX change needed.
//
// Layout: section header + card grid. Each card has a CSV icon,
// label, description, metadata row (size / rows / section / year),
// and a Download button anchoring the static file in /public/downloads/.
// =============================================================================

import { siteConfig } from "../../config/siteConfig.js";
import { assetUrl } from "../../utils/assetUrl.js";

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
          Cleaned, analysis-ready CSV files derived from Edmonton
          open data. All files are neighbourhood-level aggregates
          — no individual property records are included.
        </p>

        {/* Dataset cards */}
        <div style={{
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
        }}>
          {downloads.map((d) => (
            <div key={d.id} style={{
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
                <p style={{
                  fontSize: "1rem",
                  fontWeight: 600,
                  color: "var(--text)",
                  margin: "0 0 0.3rem",
                  lineHeight: 1.3,
                }}>
                  {d.label}
                </p>
                <p style={{
                  fontSize: "0.85rem",
                  color: "var(--text-muted)",
                  lineHeight: 1.5,
                  margin: "0 0 0.75rem",
                }}>
                  {d.description}
                </p>

                {/* Metadata pills */}
                <div style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "0.4rem",
                  marginBottom: "0.875rem",
                }}>
                  {[
                    { icon: "📁", text: d.size },
                    { icon: "⊞", text: d.rows },
                    { icon: "◎", text: d.section },
                    { icon: "◷", text: String(d.year) },
                  ].map(({ icon, text }) => (
                    <span key={text} style={{
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
                    </span>
                  ))}
                </div>

                {/* Download button */}
                <a
                  href={assetUrl(d.file)}
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
                  Download CSV
                </a>
              </div>
            </div>
          ))}
        </div>

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
          All datasets are derived from public records and processed
          under the Layer 1a cleaning pipeline (parking + R1 + R3
          rules). Neighbourhood aggregates suppress values where
          N&nbsp;&lt;&nbsp;100 to protect privacy.
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
