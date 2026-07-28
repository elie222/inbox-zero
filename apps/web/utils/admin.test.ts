import { describe, it, expect, vi, afterEach } from "vitest";

// env normalizes ADMINS into a trimmed, lowercased array, so the mocks here
// supply the same shape isAdmin sees in production
const adminEmail = "admin@example.com";
const nonAdminEmail = "user@example.com";
const anotherAdmin = "another@admin.com";
const defaultAdmins = [adminEmail, anotherAdmin];

vi.mock("@/env", () => ({
  env: {
    ADMINS: defaultAdmins,
  },
}));

describe("isAdmin", () => {
  afterEach(() => {
    // Reset modules ensures that dynamic imports get a fresh version
    // linked to the mocks set by vi.doMock in the next test.
    vi.resetModules();
  });

  it("should return true if the email is in ADMINS", async () => {
    await vi.doMock("@/env", () => ({ env: { ADMINS: defaultAdmins } }));
    const { isAdmin } = await import("./admin");
    expect(isAdmin({ email: adminEmail })).toBe(true);
  });

  it("should return false if the email is not in ADMINS", async () => {
    await vi.doMock("@/env", () => ({ env: { ADMINS: defaultAdmins } }));
    const { isAdmin } = await import("./admin");
    expect(isAdmin({ email: nonAdminEmail })).toBe(false);
  });

  it("should return false if the email is null", async () => {
    await vi.doMock("@/env", () => ({ env: { ADMINS: defaultAdmins } }));
    const { isAdmin } = await import("./admin");
    expect(isAdmin({ email: null })).toBe(false);
  });

  it("should return false if the email is undefined", async () => {
    await vi.doMock("@/env", () => ({ env: { ADMINS: defaultAdmins } }));
    const { isAdmin } = await import("./admin");
    expect(isAdmin({ email: undefined })).toBe(false);
  });

  it("matches regardless of the casing the caller supplies", async () => {
    await vi.doMock("@/env", () => ({ env: { ADMINS: defaultAdmins } }));
    const { isAdmin } = await import("./admin");
    expect(isAdmin({ email: "Admin@Example.com" })).toBe(true);
  });

  // A substring match would promote anyone whose address is contained in an
  // admin's, e.g. min@example.com inside admin@example.com
  it("requires the whole address to match an admin entry", async () => {
    await vi.doMock("@/env", () => ({ env: { ADMINS: defaultAdmins } }));
    const { isAdmin } = await import("./admin");
    expect(isAdmin({ email: "min@example.com" })).toBe(false);
    expect(isAdmin({ email: "xadmin@example.com" })).toBe(false);
  });

  it("should return false if ADMINS env var is not set (undefined)", async () => {
    await vi.doMock("@/env", () => ({ env: { ADMINS: undefined } }));
    const { isAdmin } = await import("./admin");
    expect(isAdmin({ email: adminEmail })).toBeFalsy();
  });

  it("should return false if ADMINS env var is empty", async () => {
    await vi.doMock("@/env", () => ({ env: { ADMINS: [] } }));
    const { isAdmin } = await import("./admin");
    expect(isAdmin({ email: adminEmail })).toBe(false);
  });
});
