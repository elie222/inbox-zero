import { describe, it, expect } from "vitest";
import { getActionErrorMessage } from "./error";

describe("getActionErrorMessage", () => {
  it("returns serverError when present", () => {
    const result = getActionErrorMessage({
      serverError: "Database connection failed",
    });

    expect(result).toBe("Database connection failed");
  });

  // This test uses the REAL flattened shape that next-safe-action returns
  // when defaultValidationErrorsShape: "flattened" is configured
  it("returns validation errors from flattened validationErrors shape", () => {
    const result = getActionErrorMessage({
      validationErrors: {
        formErrors: ["Form is invalid"],
        fieldErrors: {
          email: ["Email is required"],
          password: ["Password too short"],
        },
      } as any,
    });

    expect(result).toBe(
      "Form is invalid. Email is required. Password too short",
    );
  });

  it("returns only field errors when no form errors (flattened shape)", () => {
    const result = getActionErrorMessage({
      validationErrors: {
        formErrors: [],
        fieldErrors: {
          name: ["Name must be at least 10 characters"],
        },
      } as any,
    });

    expect(result).toBe("Name must be at least 10 characters");
  });

  it("returns bindArgsValidationErrors when validationErrors is empty (flattened shape)", () => {
    const result = getActionErrorMessage({
      validationErrors: {
        formErrors: [],
        fieldErrors: {},
      } as any,
      bindArgsValidationErrors: [
        {
          formErrors: ["Invalid account ID"],
          fieldErrors: {},
        } as any,
      ],
    });

    expect(result).toBe("Invalid account ID");
  });

  it("skips empty bindArgsValidationErrors entries (flattened shape)", () => {
    const result = getActionErrorMessage({
      bindArgsValidationErrors: [
        undefined as any,
        {
          formErrors: [],
          fieldErrors: {},
        } as any,
        {
          formErrors: ["Third entry error"],
          fieldErrors: {},
        } as any,
      ],
    });

    expect(result).toBe("Third entry error");
  });

  it("returns fallback when no errors present", () => {
    const result = getActionErrorMessage({});

    expect(result).toBe("An unknown error occurred");
  });

  it("returns custom fallback when provided", () => {
    const result = getActionErrorMessage({}, "Something went wrong");

    expect(result).toBe("Something went wrong");
  });

  it("prioritizes serverError over validation errors (flattened shape)", () => {
    const result = getActionErrorMessage({
      serverError: "Server error",
      validationErrors: {
        formErrors: ["Validation error"],
        fieldErrors: {},
      } as any,
    });

    expect(result).toBe("Server error");
  });

  it("prioritizes validationErrors over bindArgsValidationErrors (flattened shape)", () => {
    const result = getActionErrorMessage({
      validationErrors: {
        formErrors: ["Input validation error"],
        fieldErrors: {},
      } as any,
      bindArgsValidationErrors: [
        {
          formErrors: ["Bind args error"],
          fieldErrors: {},
        } as any,
      ],
    });

    expect(result).toBe("Input validation error");
  });

  describe("with prefix option", () => {
    it("prepends prefix to error message", () => {
      const result = getActionErrorMessage(
        { serverError: "Invalid input" },
        { prefix: "Failed to save" },
      );

      expect(result).toBe("Failed to save. Invalid input");
    });

    it("returns only prefix when no error message", () => {
      const result = getActionErrorMessage({}, { prefix: "Failed to save" });

      expect(result).toBe("Failed to save");
    });

    it("prepends prefix to validation errors", () => {
      const result = getActionErrorMessage(
        {
          validationErrors: {
            formErrors: [],
            fieldErrors: { name: ["Name is required"] },
          } as any,
        },
        { prefix: "Failed to update user" },
      );

      expect(result).toBe("Failed to update user. Name is required");
    });

    it("uses custom fallback with prefix when no error", () => {
      const result = getActionErrorMessage(
        {},
        { prefix: "Failed to save", fallback: "Please try again" },
      );

      expect(result).toBe("Failed to save");
    });

    it("uses fallback when no prefix and no error", () => {
      const result = getActionErrorMessage(
        {},
        { fallback: "Custom fallback message" },
      );

      expect(result).toBe("Custom fallback message");
    });
  });
});
