import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";
import { activateLemonLicenseKey } from "./index";

const mocks = vi.hoisted(() => ({
  activateLicense: vi.fn(),
}));

vi.mock("@lemonsqueezy/lemonsqueezy.js", () => ({
  activateLicense: mocks.activateLicense,
  getCustomer: vi.fn(),
  lemonSqueezySetup: vi.fn(),
  updateSubscriptionItem: vi.fn(),
}));

describe("activateLemonLicenseKey", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    mocks.activateLicense.mockResolvedValue({
      statusCode: 200,
      error: null,
      data: null,
    });
  });

  it("does not write the license key to logs", async () => {
    const licenseKey = "secret-license-key";
    const logger = createTestLogger();
    const logSpies = [
      vi.spyOn(logger, "info"),
      vi.spyOn(logger, "error"),
      vi.spyOn(logger, "warn"),
      vi.spyOn(logger, "trace"),
    ];

    await activateLemonLicenseKey(licenseKey, "License for user-1", logger);

    const loggedValues = logSpies.flatMap((spy) => spy.mock.calls).flat();
    expect(loggedValues).not.toContainEqual(
      expect.stringContaining(licenseKey),
    );
    expect(mocks.activateLicense).toHaveBeenCalledWith(
      licenseKey,
      "License for user-1",
    );
  });
});
