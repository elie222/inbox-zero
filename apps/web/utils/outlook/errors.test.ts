import { describe, it, expect } from "vitest";
import { isNotFoundError, isAlreadyExistsError } from "./errors";

describe("isNotFoundError", () => {
  it("should return true for statusCode 404", () => {
    const error = { statusCode: 404, message: "Not found" };
    expect(isNotFoundError(error)).toBe(true);
  });

  it("should return false for other status codes", () => {
    expect(isNotFoundError({ statusCode: 400 })).toBe(false);
    expect(isNotFoundError({ statusCode: 401 })).toBe(false);
    expect(isNotFoundError({ statusCode: 403 })).toBe(false);
    expect(isNotFoundError({ statusCode: 500 })).toBe(false);
  });

  it("should return false for null", () => {
    expect(isNotFoundError(null)).toBe(false);
  });

  it("should return false for undefined", () => {
    expect(isNotFoundError(undefined)).toBe(false);
  });

  it("should return false for non-object", () => {
    expect(isNotFoundError("error")).toBe(false);
    expect(isNotFoundError(404)).toBe(false);
  });

  it("should return false for object without statusCode", () => {
    expect(isNotFoundError({ message: "Not found" })).toBe(false);
    expect(isNotFoundError({ code: "itemNotFound" })).toBe(false);
  });

  it("should return false for empty object", () => {
    expect(isNotFoundError({})).toBe(false);
  });

  it("should handle Error with statusCode property", () => {
    const error = Object.assign(new Error("Not found"), { statusCode: 404 });
    expect(isNotFoundError(error)).toBe(true);
  });
});

describe("isAlreadyExistsError", () => {
  it("should return true for 'already exists' message", () => {
    expect(isAlreadyExistsError({ message: "Resource already exists" })).toBe(
      true,
    );
  });

  it("should return true for 'duplicate' message", () => {
    expect(isAlreadyExistsError({ message: "duplicate entry" })).toBe(true);
  });

  it("should return true for 'conflict' message", () => {
    expect(isAlreadyExistsError({ message: "conflict detected" })).toBe(true);
  });

  it("should return false for unrelated message", () => {
    expect(isAlreadyExistsError({ message: "Not found" })).toBe(false);
  });

  it("should return false for null", () => {
    expect(isAlreadyExistsError(null)).toBe(false);
  });

  it("should return false for undefined", () => {
    expect(isAlreadyExistsError(undefined)).toBe(false);
  });

  it("should return false for object without message", () => {
    expect(isAlreadyExistsError({ code: 409 })).toBe(false);
  });
});
