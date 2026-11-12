import { afterEach, describe, it, expect, vi } from "vitest";
import { resolveLabelNameAndId } from "./resolve-label";
import type { EmailProvider } from "@/utils/email/types";

vi.mock("@/env", async (importActual) => {
  const actual = await importActual<typeof import("@/env")>();
  return {
    ...actual,
    env: {
      ...actual.env,
      AXIOM_TOKEN: undefined,
      NEXT_PUBLIC_LOG_SCOPES: undefined,
    },
  };
});

describe("resolveLabelNameAndId", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ["disabled Gmail", new Error("Mail service not enabled"), "warn"],
    ["disconnected account", new Error("invalid_grant"), "warn"],
    ["unexpected lookup failure", new Error("Lookup failed"), "error"],
  ])("preserves the unresolved label for %s", async (_name, error, level) => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const getLabelByName = vi.fn().mockRejectedValue(error);
    const createLabel = vi.fn();

    await expect(
      resolveLabelNameAndId({
        emailProvider: {
          getLabelByName,
          createLabel,
        } as unknown as EmailProvider,
        label: "Test label",
      }),
    ).resolves.toEqual({ label: "Test label", labelId: null });

    expect(createLabel).not.toHaveBeenCalled();
    expect(level === "warn" ? warnSpy : errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Error resolving label"),
    );
    expect(level === "warn" ? errorSpy : warnSpy).not.toHaveBeenCalled();
  });

  it("keeps unresolved creation conflicts at error level", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = Object.assign(new Error("Label name exists or conflicts"), {
      code: 409,
    });
    const createLabel = vi.fn().mockRejectedValue(error);

    await expect(
      resolveLabelNameAndId({
        emailProvider: {
          getLabelByName: vi.fn().mockResolvedValue(null),
          createLabel,
        } as unknown as EmailProvider,
        label: "Test label",
      }),
    ).resolves.toEqual({ label: "Test label", labelId: null });

    expect(createLabel).toHaveBeenCalledWith("Test label");
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Error resolving label"),
    );
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("should skip resolution for AI templates", async () => {
    const mockEmailProvider = {
      getLabelByName: vi.fn(),
      createLabel: vi.fn(),
    } as unknown as EmailProvider;

    const result = await resolveLabelNameAndId({
      emailProvider: mockEmailProvider,
      label: "{{Choose between current labels based on building}}",
      labelId: null,
    });

    // Should return the template as-is without calling provider methods
    expect(result).toEqual({
      label: "{{Choose between current labels based on building}}",
      labelId: null,
    });
    expect(mockEmailProvider.getLabelByName).not.toHaveBeenCalled();
    expect(mockEmailProvider.createLabel).not.toHaveBeenCalled();
  });

  it("should resolve normal labels without templates", async () => {
    const mockEmailProvider = {
      getLabelByName: vi
        .fn()
        .mockResolvedValue({ id: "Label_123", name: "My Label" }),
    } as unknown as EmailProvider;

    const result = await resolveLabelNameAndId({
      emailProvider: mockEmailProvider,
      label: "My Label",
      labelId: null,
    });

    expect(result).toEqual({
      label: "My Label",
      labelId: "Label_123",
    });
    expect(mockEmailProvider.getLabelByName).toHaveBeenCalledWith("My Label");
  });

  it("should return both when both provided", async () => {
    const mockEmailProvider = {} as EmailProvider;

    const result = await resolveLabelNameAndId({
      emailProvider: mockEmailProvider,
      label: "My Label",
      labelId: "Label_123",
    });

    expect(result).toEqual({
      label: "My Label",
      labelId: "Label_123",
    });
  });

  it("should handle templates with complex expressions", async () => {
    const mockEmailProvider = {
      getLabelByName: vi.fn(),
      createLabel: vi.fn(),
    } as unknown as EmailProvider;

    const result = await resolveLabelNameAndId({
      emailProvider: mockEmailProvider,
      label: "Building: {{name}} - {{status}}",
      labelId: null,
    });

    expect(result).toEqual({
      label: "Building: {{name}} - {{status}}",
      labelId: null,
    });
    expect(mockEmailProvider.getLabelByName).not.toHaveBeenCalled();
  });
});
