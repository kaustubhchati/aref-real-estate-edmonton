// =============================================================================
// Download.jsx — text stub for the bulk-download page.
// Real download links arrive once each section publishes its output CSVs to
// website/public/data/<section>/ (CLAUDE.md §6 data flow).
// =============================================================================

export default function Download() {
  return (
    <article className="content-page">
      <h1>Download</h1>
      <p>
        Bulk CSV / GeoJSON downloads for each map will be linked here. Files
        are produced by the R pipeline on the laptop and copied into the site
        at refresh time — see <code>REFRESH_NOTES.md</code> for the cadence.
      </p>
    </article>
  );
}
