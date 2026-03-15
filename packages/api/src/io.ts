import { readFile } from "node:fs/promises";

export async function readJsonInput(filePath: string) {
  const input =
    filePath === "-" ? await readFromStdin() : await readFile(filePath, "utf8");

  return JSON.parse(stripUtf8Bom(input));
}

function readFromStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let input = "";

    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      input += chunk;
    });
    process.stdin.on("end", () => resolve(input));
    process.stdin.on("error", reject);
  });
}

function stripUtf8Bom(input: string) {
  return input.replace(/^\uFEFF/, "");
}
