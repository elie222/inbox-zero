import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { SpamTokenizer } from "../../utils/spam/tokenizer";
import { tokenizeWithLanguage } from "../../utils/spam/native-tokenizer";
import { collectImage, collectPdf } from "../../utils/spam/media";

async function main() {
  const fixtures = JSON.parse(
    await readFile(
      resolve(
        import.meta.dirname,
        "../../utils/spam/fixtures/html-tokens.json",
      ),
      "utf8",
    ),
  ) as { id: string; html: string; expected: Record<string, number> }[];
  const results = [];
  for (const fixture of fixtures) {
    const tokenizer = await tokenizeWithLanguage((tokens) =>
      tokens.html(fixture.html),
    );
    const keys = new Set([
      ...Object.keys(fixture.expected),
      ...tokenizer.tokens.keys(),
    ]);
    const differences = [...keys]
      .filter(
        (key) =>
          (tokenizer.tokens.get(key) ?? 0) !== (fixture.expected[key] ?? 0),
      )
      .map((key) => ({
        key,
        expected: fixture.expected[key] ?? 0,
        actual: tokenizer.tokens.get(key) ?? 0,
      }));
    results.push({ id: fixture.id, matches: !differences.length, differences });
  }
  console.log(
    JSON.stringify(
      {
        html: {
          matches: results.filter((r) => r.matches).length,
          total: results.length,
        },
        mismatches: results.filter((r) => !r.matches).slice(0, 35),
      },
      null,
      2,
    ),
  );
  if (process.argv[2]) {
    for (const [input, output, collect] of [
      [
        "media-image-oracle-input.json",
        "media-image-oracle-output.json",
        collectImage,
      ],
      ["full-pdf-oracle-input.json", "full-pdf-oracle-output.json", collectPdf],
    ] as const) {
      const inputs = JSON.parse(
        await readFile(resolve(process.argv[2], input), "utf8"),
      );
      const outputs = JSON.parse(
        await readFile(resolve(process.argv[2], output), "utf8"),
      );
      const checks = [];
      for (const row of inputs) {
        const tokenizer = new SpamTokenizer();
        await collect(await readFile(row.imagePath ?? row.pdfPath), tokenizer);
        const expected = outputs.find(
          (r: { id: string }) => r.id === row.id,
        ).tokens;
        const keys = new Set([
          ...Object.keys(expected),
          ...tokenizer.tokens.keys(),
        ]);
        const differences = [...keys].filter(
          (key) => (tokenizer.tokens.get(key) ?? 0) !== (expected[key] ?? 0),
        );
        checks.push({ id: row.id, matches: !differences.length, differences });
      }
      console.log(JSON.stringify({ input, checks }, null, 2));
    }
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
