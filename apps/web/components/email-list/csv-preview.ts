const MAX_ROWS = 500;
const MAX_COLUMNS = 50;
// Enough text for MAX_ROWS of a typical export without decoding a huge file.
const MAX_TEXT_BYTES = 2 * 1024 * 1024;

export type CsvPreview = { rows: string[][]; truncated: boolean };

export async function getCsvPreview(
  blob: Blob,
): Promise<CsvPreview | undefined> {
  const sliced = blob.size > MAX_TEXT_BYTES;
  const bytes = new Uint8Array(
    await blob.slice(0, MAX_TEXT_BYTES).arrayBuffer(),
  );
  // Text files never contain NUL; binary files renamed to .csv usually do.
  if (bytes.includes(0)) return;

  // CSV parsing is rare, so the parser stays out of the mail-view bundle.
  const { parse } = await import("papaparse");
  const result = parse<string[]>(decodeText(bytes, sliced), {
    preview: MAX_ROWS + 1,
    skipEmptyLines: true,
  });
  const rows = result.data;
  // A sliced file may end mid-row.
  if (sliced && rows.length <= MAX_ROWS) rows.pop();

  const truncated =
    sliced ||
    result.meta.truncated ||
    rows.length > MAX_ROWS ||
    rows.some((row) => row.length > MAX_COLUMNS);
  return {
    rows: rows.slice(0, MAX_ROWS).map((row) => row.slice(0, MAX_COLUMNS)),
    truncated,
  };
}

// Excel on Windows still exports CSV as Windows-1252 unless told otherwise.
function decodeText(bytes: Uint8Array, sliced: boolean) {
  try {
    // Streaming leaves a character split at the slice boundary undecoded
    // instead of failing; a complete file must flush its final bytes.
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes, {
      stream: sliced,
    });
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}
