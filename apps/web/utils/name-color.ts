// A stable colour derived from a name, so the same company or label reads the
// same everywhere — sidebar dot, company card, avatar chip — without storing a
// colour on the record.
//
// Consumers set the result as the `--company-hue` custom property and let the
// `.company-card` / `.company-chip` rules in globals.css pick saturation and
// lightness, which differ between light and dark so the text stays readable.
export function nameHue(name: string): number {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return Math.abs(hash) % 360;
}
