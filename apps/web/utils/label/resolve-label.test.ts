import { describe, it, expect, vi } from "vitest";
import { resolveLabelNameAndId } from "./resolve-label";
import type { EmailProvider } from "@/utils/email/types";

describe("resolveLabelNameAndId", () => {
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

  it("should take the provider's name when both provided", async () => {
    const mockEmailProvider = {
      getLabelById: vi
        .fn()
        .mockResolvedValue({ id: "Label_123", name: "Current Name" }),
    } as unknown as EmailProvider;

    const result = await resolveLabelNameAndId({
      emailProvider: mockEmailProvider,
      label: "Stale Name",
      labelId: "Label_123",
    });

    expect(result).toEqual({
      label: "Current Name",
      labelId: "Label_123",
    });
    expect(mockEmailProvider.getLabelById).toHaveBeenCalledWith("Label_123");
  });

  it("should keep the given name when the ID lookup finds nothing", async () => {
    const mockEmailProvider = {
      getLabelById: vi.fn().mockResolvedValue(null),
    } as unknown as EmailProvider;

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

  it("should keep the given name when the ID lookup fails", async () => {
    const mockEmailProvider = {
      getLabelById: vi.fn().mockRejectedValue(new Error("boom")),
    } as unknown as EmailProvider;

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

  it("should not look up a template even when an ID is provided", async () => {
    const mockEmailProvider = {
      getLabelById: vi.fn(),
    } as unknown as EmailProvider;

    const result = await resolveLabelNameAndId({
      emailProvider: mockEmailProvider,
      label: "{{pick a label}}",
      labelId: "Label_123",
    });

    expect(result).toEqual({
      label: "{{pick a label}}",
      labelId: "Label_123",
    });
    expect(mockEmailProvider.getLabelById).not.toHaveBeenCalled();
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
