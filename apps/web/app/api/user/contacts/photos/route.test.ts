import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";

const { envMock, getContactPhotosMock, redisMock } = vi.hoisted(() => ({
  envMock: { NEXT_PUBLIC_CONTACTS_ENABLED: true },
  getContactPhotosMock: vi.fn(),
  redisMock: { get: vi.fn(), set: vi.fn() },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/env", () => ({ env: envMock }));
vi.mock("@/utils/redis", () => ({ redis: redisMock }));
vi.mock("@/utils/middleware", () => ({
  withEmailProvider:
    (
      _scope: string,
      handler: (
        request: NextRequest & Record<string, unknown>,
      ) => Promise<Response>,
    ) =>
    (request: NextRequest) =>
      handler(
        Object.assign(request, {
          auth: { emailAccountId: "account-1" },
          emailProvider: { getContactPhotos: getContactPhotosMock },
          logger: createTestLogger(),
        }),
      ),
}));

import { GET } from "./route";

describe("GET /api/user/contacts/photos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    envMock.NEXT_PUBLIC_CONTACTS_ENABLED = true;
  });

  it("serves cached photos without sweeping the provider again", async () => {
    redisMock.get.mockResolvedValue({ "a@example.com": "https://photo/a" });

    const body = await getPhotos();

    expect(getContactPhotosMock).not.toHaveBeenCalled();
    expect(body).toEqual({ photos: { "a@example.com": "https://photo/a" } });
  });

  it("sweeps the provider once and caches the result, including an empty one", async () => {
    redisMock.get.mockResolvedValue(null);
    getContactPhotosMock.mockResolvedValue({});

    const body = await getPhotos();

    expect(getContactPhotosMock).toHaveBeenCalledTimes(1);
    expect(redisMock.set).toHaveBeenCalledWith(
      "contact-photos:account-1",
      {},
      { ex: 24 * 60 * 60 },
    );
    expect(body).toEqual({ photos: {} });
  });

  it("falls back to no photos and caches the miss briefly when the sweep fails", async () => {
    redisMock.get.mockResolvedValue(null);
    getContactPhotosMock.mockRejectedValue(new Error("rate limited"));

    const body = await getPhotos();

    expect(body).toEqual({ photos: {} });
    expect(redisMock.set).toHaveBeenCalledWith(
      "contact-photos:account-1",
      {},
      { ex: 15 * 60 },
    );
  });

  it("still serves photos when the cache is unavailable", async () => {
    redisMock.get.mockRejectedValue(new Error("redis down"));
    redisMock.set.mockRejectedValue(new Error("redis down"));
    getContactPhotosMock.mockResolvedValue({
      "a@example.com": "https://photo/a",
    });

    const body = await getPhotos();

    expect(body).toEqual({ photos: { "a@example.com": "https://photo/a" } });
  });

  it("does not query the provider when contacts are disabled", async () => {
    envMock.NEXT_PUBLIC_CONTACTS_ENABLED = false;

    const response = await GET(
      new NextRequest("http://localhost:3000/api/user/contacts/photos"),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(404);
    expect(getContactPhotosMock).not.toHaveBeenCalled();
  });
});

async function getPhotos() {
  const response = await GET(
    new NextRequest("http://localhost:3000/api/user/contacts/photos"),
    { params: Promise.resolve({}) },
  );
  return response.json();
}
