const { resolve } = require("node:path");

// based on: https://turbo.build/repo/docs/guides/tools/eslint#our-repoeslint-config-package

const project = resolve(process.cwd(), "tsconfig.json");

/** @type {import("eslint").Linter.Config} */
module.exports = {
  extends: [
    // "eslint:recommended",
    // "prettier",
    // require.resolve("@vercel/style-guide/eslint/next"),
    // "eslint-config-turbo",
  ],
  parserOptions: {
    project,
  },
  globals: {
    React: true,
    JSX: true,
  },
  env: {
    node: true,
    browser: true,
  },
  plugins: ["only-warn"],
  settings: {
    "import/resolver": {
      typescript: {
        project,
      },
    },
  },
  ignorePatterns: [
    // Ignore dotfiles
    ".*.js",
    "node_modules/",
    "dist/",
  ],
  overrides: [{ files: ["*.js?(x)", "*.ts?(x)"] }],
};
