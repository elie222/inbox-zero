import { describe, expect, it } from "vitest";
import { MailApp } from "./MailApp";

describe("MailApp", () => {
  it("exports the shared mail entry", () => {
    expect(typeof MailApp).toBe("function");
  });
});
