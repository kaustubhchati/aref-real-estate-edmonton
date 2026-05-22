// =============================================================================
// parseCsv.js
//
// Minimal CSV parser. ~40 lines, no dependencies, handles:
//   • comma separators
//   • CRLF + LF line endings
//   • double-quoted fields containing commas or newlines
//   • escaped quotes inside quoted fields ("" → ")
//
// We avoid pulling in PapaParse / d3-dsv because (a) this is the only CSV the
// site loads today, (b) every dependency we ship is one Olivia has to learn,
// (c) the file is hand-curated by our R pipeline so the format is predictable.
// If a future section needs streaming, multi-encoding, or schema inference,
// reach for a library then.
//
// Public surface:
//   parseCsv(text)               → string[][]   (header row first)
//   parseCsvAsObjects(text)      → object[]     (keys = header names)
// =============================================================================

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        // Escaped quote ("") → literal ", otherwise close quoting.
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++;
    } else {
      if (c === ",") {
        row.push(field); field = ""; i++;
      } else if (c === "\n" || c === "\r") {
        row.push(field); field = "";
        // Skip the LF half of a CRLF pair so we don't emit a blank row.
        if (c === "\r" && text[i + 1] === "\n") i++;
        if (row.length > 1 || row[0] !== "") rows.push(row);
        row = []; i++;
      } else if (c === '"' && field === "") {
        // Only open quoting at field start — quotes mid-field are literal.
        inQuotes = true; i++;
      } else {
        field += c; i++;
      }
    }
  }
  // Flush the final field/row if the file didn't end with a newline.
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0] !== "") rows.push(row);
  }
  return rows;
}

export function parseCsvAsObjects(text) {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const [header, ...data] = rows;
  return data.map((r) => {
    const o = {};
    for (let i = 0; i < header.length; i++) o[header[i]] = r[i];
    return o;
  });
}
