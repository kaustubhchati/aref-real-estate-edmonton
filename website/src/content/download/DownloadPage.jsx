// =============================================================================
// DownloadPage.jsx
//
// The public download page: every published CSV, grouped into datasets, with
// enough about each file that a reader can decide before clicking.
//
// THE ONE RULE THIS FILE EXISTS TO KEEP
//   Not one fact about a file is written here or in siteConfig. Filename, size,
//   row count, column count, coverage span and build date are all read from the
//   producing section's manifest at render. siteConfig carries only editorial
//   text — titles, descriptions, the noun for a row — because that is the part
//   no machine can measure.
//   The reason is on the record: this page told the public the assessment file
//   held "407 neighbourhoods" while it held 344. The number was a literal, so
//   nothing checked it and nothing could. Anything measurable now comes from the
//   thing being measured.
//
// WHERE A DATASET COMES FROM
//   A dataset is one section's manifest. The files in it are that manifest's
//   `downloads` array. So adding a file to an existing section needs no change
//   here at all — it appears when the manifest lists it. Adding a NEW section
//   means adding a row to SOURCES below, because nothing in a manifest says
//   which section it belongs to.
//
// LAYOUT
//   Hero (the home page's own treatment, shorter) -> stat card straddling the
//   hero edge -> one section per dataset -> a list of files inside each.
// =============================================================================

import { useEffect, useState } from "react";

import { siteConfig } from "../../config/siteConfig.js";
import { assetUrl } from "../../utils/assetUrl.js";
import PearlBand from "../../components/PearlBand.jsx";
import { loadManifest } from "../property-assessment/dataSources.js";
import { loadPermitManifest } from "../building-permits/dataSources.js";

// === Where the facts come from ===============================================
// One row per dataset. `load` fetches that section's manifest; the two readers
// pull the published-artefact list and the section's year list out of it.
//
// The readers differ because the manifests differ by design: property
// assessment nests its years under a city (it spans several sources), building
// permits keeps a flat list (it has one). That shape is the backend's to choose,
// so it is read here rather than imposed.
//
// This table is the ONE thing a new downloadable section needs a code edit for.
const SOURCES = [
  {
    datasetId: "property-assessment",
    load: loadManifest,
    artefacts: (m) => m?.downloads ?? [],
    years: (m) => m?.cities?.Edmonton?.assessment?.years ?? [],
  },
  {
    datasetId: "building-permits",
    load: loadPermitManifest,
    artefacts: (m) => m?.downloads ?? [],
    years: (m) => m?.years ?? [],
  },
];

// === Formatting ==============================================================

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// "2026-08-12" -> "12 August 2026".
//
// Parsed by hand rather than with `new Date(iso)`. A bare ISO date is read as
// UTC midnight, which in Edmonton is the evening BEFORE, so a Date-based format
// renders every build date one day early for half the year. There is no time
// here to get wrong, so no Date is involved.
function formatIsoDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ""));
  if (!m) return String(iso ?? "");
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

// Decimal KB, because that is what a file manager shows and what a reader will
// compare against. Below a kilobyte the exact byte count is more use than "0.6 KB".
function formatBytes(bytes) {
  if (typeof bytes !== "number" || !isFinite(bytes)) return "";
  return bytes < 1000 ? `${bytes} bytes` : `${(bytes / 1000).toFixed(1)} KB`;
}

// The published filename minus its extension and any trailing year, which is how
// an artefact finds its editorial entry in siteConfig. The assessment aggregate
// is republished under a new year each refresh; keying on the whole filename
// would drop its title the moment the year rolled.
function fileStem(filename) {
  return String(filename ?? "").replace(/\.csv$/i, "").replace(/_\d{4}(-\d{4})?$/, "");
}

// The year(s) a single artefact covers.
//
// Two shapes, both from the manifest: a file with a year column carries a
// measured `coverageSpan`; a file whose year lives in its NAME (the assessment
// aggregate has no year column at all) carries the year there. Neither is
// invented — the filename is templated by the runner from the data year.
function artefactYears(artefact) {
  if (artefact?.coverageSpan) {
    const { from, to } = artefact.coverageSpan;
    return [from, to].filter((y) => typeof y === "number");
  }
  const inName = /_(\d{4})\.csv$/i.exec(String(artefact?.file ?? ""));
  return inName ? [Number(inName[1])] : [];
}

// "2009 to 2026", or "2026" when a span collapses to a single year.
function describeYears(years) {
  if (!years.length) return null;
  const lo = Math.min(...years);
  const hi = Math.max(...years);
  return lo === hi ? String(lo) : `${lo} to ${hi}`;
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

// === Page ====================================================================

export default function DownloadPage() {
  const { org, downloadDatasets } = siteConfig;
  // null until every manifest has resolved. The page shows nothing half-built:
  // a stat card that counts up as manifests land would be worse than a wait.
  const [datasets, setDatasets] = useState(null);
  const [totals, setTotals] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all(SOURCES.map((s) => s.load()))
      .then((manifests) => {
        if (cancelled) return;

        const built = SOURCES.map((source, i) => {
          const manifest = manifests[i];
          const editorial = downloadDatasets.find((d) => d.id === source.datasetId);
          const artefacts = source.artefacts(manifest);
          return {
            id: source.datasetId,
            editorial,
            years: source.years(manifest),
            files: artefacts.map((artefact) => ({
              artefact,
              // An artefact with no editorial entry still renders, titled by its
              // own filename. A published file that nobody wrote a title for is
              // still published, and silently hiding it would be the worse bug.
              text: editorial?.files?.[fileStem(artefact.file)] ?? null,
            })),
          };
        }).filter((d) => d.files.length > 0);

        setDatasets(built);
        setTotals({
          datasets: built.length,
          files: built.reduce((n, d) => n + d.files.length, 0),
          years: new Set(built.flatMap((d) => d.years)).size,
        });
      })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [downloadDatasets]);

  return (
    // `readpage` lets the shell grow with the page so the window scrolls; without
    // it the shell pins to the viewport and clips everything below the fold.
    // `brand` is the read-page palette, and PearlBand requires it as an ancestor.
    //
    // NOTE the class that is NOT here. This root used to also carry `shell-main`,
    // which is the shell's own <main> class — so the route had two elements
    // wearing it, one inside the other. That was survivable while the page was a
    // plain block, but `.shell-main` sets `flex: 1 1 0`, and as a flex item of
    // the real <main> this root then resolved to ZERO height: the hero rendered
    // into nothing and the footer painted over the top of the page. Home, About
    // and Research Competition all use `readpage brand` alone. So does this.
    <div className="readpage brand">

      {/* Hero — the home page's own treatment and classes, on a shorter block. */}
      <section className="hero dl-hero">
        <PearlBand variant="hero">
          <div className="wrap">
            <div className="hero__inner dl-hero__inner">
              <div className="hero__rule" />
              <p className="hero__eyebrow">{org} · Open data</p>
              <h1 className="hero__title">Download datasets</h1>
              <p className="hero__sub">
                Cleaned, analysis-ready CSV files derived from City of Edmonton
                open data. No file contains individual property records.
              </p>
            </div>
          </div>
        </PearlBand>
      </section>

      {/* Stat card, straddling the hero's bottom edge — the home page's pattern.
          Unlike the home page's, all three numbers are counted from what
          actually loaded, so they cannot disagree with the page beneath them. */}
      {totals && (
        <div className="wrap">
          <div className="stats">
            <div className="stat">
              <div className="stat__value">{totals.datasets}</div>
              <div className="stat__label">datasets</div>
            </div>
            <div className="stat">
              <div className="stat__value">{totals.files}</div>
              <div className="stat__label">files</div>
            </div>
            <div className="stat">
              <div className="stat__value">{totals.years}</div>
              <div className="stat__label">years covered</div>
            </div>
          </div>
        </div>
      )}

      <div className="wrap dl-body">
        {!datasets ? (
          <p className="dl-status">
            {error ? `Could not load the dataset catalogue: ${error}` : "Loading…"}
          </p>
        ) : (
          datasets.map((dataset) => {
            const span = describeYears(
              dataset.files.flatMap(({ artefact }) => artefactYears(artefact))
            );
            return (
              <section className="dl-dataset" key={dataset.id}>
                <h2 className="dl-ds-title">
                  {dataset.editorial?.title ?? dataset.id}
                </h2>
                {dataset.editorial?.description && (
                  <p className="dl-ds-desc">{dataset.editorial.description}</p>
                )}
                <p className="dl-ds-line">
                  <b>{plural(dataset.files.length, "file")}</b>
                  {dataset.editorial?.sectionLabel && ` · ${dataset.editorial.sectionLabel}`}
                  {span && ` · ${span}`}
                </p>

                <h3 className="dl-h3">Files</h3>
                <ul className="dl-res">
                  {dataset.files.map(({ artefact, text }) => {
                    const size = formatBytes(artefact.bytes);
                    const coverage = describeYears(artefactYears(artefact));
                    return (
                      <li className="dl-resource" key={artefact.file}>
                        <div className="dl-res-head">
                          <span className="dl-badge">CSV</span>
                          <div>
                            <h4 className="dl-res-title">
                              {text?.title ?? artefact.file}
                            </h4>
                            {text?.description && (
                              <p className="dl-res-desc">{text.description}</p>
                            )}
                          </div>
                        </div>

                        {/* The link names its own file. Three links all reading
                            "Download CSV" are indistinguishable in a screen
                            reader's link list, and the heading that tells them
                            apart is not part of the link. */}
                        <a
                          className="dl-btn"
                          href={assetUrl(`/downloads/${artefact.file}`)}
                          download
                        >
                          {artefact.file}
                          <span className="dl-btn-fmt">{` (CSV, ${size})`}</span>
                        </a>

                        <h5 className="dl-sub">This file</h5>
                        <dl className="dl-kv">
                          <dt>Rows</dt>
                          <dd>
                            {artefact.rowUniverse?.rowsPresent ?? artefact.rows}
                            {text?.unit ? ` ${text.unit}` : ""}
                          </dd>
                          <dt>Columns</dt>
                          <dd>{artefact.columns}</dd>
                          {coverage && (<><dt>Coverage</dt><dd>{coverage}</dd></>)}
                          {artefact.builtAt && (
                            <><dt>Built</dt><dd>{formatIsoDate(artefact.builtAt)}</dd></>
                          )}
                        </dl>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}
