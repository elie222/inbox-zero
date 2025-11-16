import { describe, it, expect, vi } from "vitest";
import { resolveLabelNameAndId } from "./resolve-label";
import type { EmailProvider } from "@/utils/email/types";

vi.mock("server-only", () => ({}));

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
