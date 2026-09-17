import { expect, it, vi } from "vitest";
import config from "./serwist.config.mjs";

vi.mock("@serwist/next/config", () => ({
  serwist: async () => ({
    globPatterns: ["custom-output/static/**/*.{js,css,json}", "public/**/*"],
  }),
}));

it("includes emitted WASM in the production precache without losing custom output paths or existing asset types", () => {
  expect(config.globPatterns).toEqual([
    "custom-output/static/**/*.{js,css,json,wasm}",
    "public/**/*",
  ]);
});
