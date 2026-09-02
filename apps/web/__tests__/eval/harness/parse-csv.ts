/**
 * Minimal RFC 4180 parser for eval datasets that ship as CSV. Handles quoted
 * fields containing commas, escaped quotes (""), and embedded newlines, which
 * email bodies routinely have. Returns one object per data row keyed by the
 * header row.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const [header, ...rows] = parseCsvRows(text.replace(/^\uFEFF/, ""));
  if (!header) return [];

  return rows.map((row, index) => {
    if (row.length !== header.length) {
      throw new Error(
        `CSV row ${index + 2} has ${row.length} fields, expected ${header.length}`,
      );
    }
    return Object.fromEntries(header.map((key, i) => [key, row[i] ?? ""]));
  });
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let lineStart = 0;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char !== '"') {
        field += char;
      } else if (text[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = false;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      // Only a terminator with nothing before it on the line is a blank line;
      // a line holding just `""` is a real single-field row.
      const blankLine = i === lineStart;
      if (char === "\r" && text[i + 1] === "\n") i++;
      lineStart = i + 1;
      if (blankLine) continue;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (inQuotes) {
    throw new Error("CSV ends inside a quoted field (unterminated quote)");
  }

  if (text.length > lineStart) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}
