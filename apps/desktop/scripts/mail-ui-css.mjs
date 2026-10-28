import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(desktopRoot, "../..");
const webRoot = join(repoRoot, "apps/web");
const mailUiRoot = join(repoRoot, "packages/mail-ui");
const webRequire = createRequire(join(webRoot, "package.json"));

export async function buildMailUiCss({ outFile }) {
  const [postcss, tailwindcss, autoprefixer, webTailwindConfig, cssInput] =
    await Promise.all([
      Promise.resolve(webRequire("postcss")),
      Promise.resolve(webRequire("tailwindcss")),
      Promise.resolve(webRequire("autoprefixer")),
      Promise.resolve(webRequire("./tailwind.config.js")),
      readDesktopCssInput(),
    ]);

  const result = await postcss([
    tailwindcss({
      ...webTailwindConfig,
      content: [
        join(mailUiRoot, "src/**/*.{ts,tsx}"),
        join(desktopRoot, "src/renderer/**/*.{ts,tsx}"),
      ],
      safelist: [],
    }),
    autoprefixer,
  ]).process(cssInput, {
    from: join(webRoot, "styles/globals.css"),
    to: outFile,
    map: false,
  });

  await mkdir(dirname(outFile), { recursive: true });
  await writeFile(outFile, result.css);
}

export function withMailUiStylesheet(html, href = "./mail-ui.css") {
  if (html.includes(href)) return html;
  const link = `    <link rel="stylesheet" href="${href}">\n`;
  if (html.includes("</head>"))
    return html.replace("</head>", `${link}  </head>`);
  return `${link}${html}`;
}

async function readDesktopCssInput() {
  const globalsPath = join(webRoot, "styles/globals.css");
  const scrollbarPath = join(webRoot, "styles/scrollbar.css");
  const [globalsCss, scrollbarCss] = await Promise.all([
    readFile(globalsPath, "utf8"),
    readFile(scrollbarPath, "utf8"),
  ]);

  return globalsCss.replace(
    /^@import\s+["']\.\/scrollbar\.css["'];\s*$/m,
    scrollbarCss,
  );
}
