import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { acuityFetch, AcuityApiError } from "./client";

const MOCK_USER_ID = "test-user-123";
const MOCK_API_KEY = "test-api-key-abc";
const EXPECTED_AUTH = `Basic ${Buffer.from(`${MOCK_USER_ID}:${MOCK_API_KEY}`).toString("base64")}`;

describe("acuityFetch", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
    vi.stubEnv("ACUITY_USER_ID", MOCK_USER_ID);
    vi.stubEnv("ACUITY_API_KEY", MOCK_API_KEY);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("makes GET request with Basic Auth header", async () => {
    const mockResponse = { id: 1, type: "appointment" };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => mockResponse,
    });

    const result = await acuityFetch<typeof mockResponse>(
      "GET",
      "/appointments",
    );

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe("https://acuityscheduling.com/api/v1/appointments");
    expect(options.method).toBe("GET");
    expect(options.headers.Authorization).toBe(EXPECTED_AUTH);
    expect(result).toEqual(mockResponse);
  });

  it("throws AcuityApiError on non-ok response (404)", async () => {
    const errorBody = { error: "not found", message: "Appointment not found" };
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: "Not Found",
      json: async () => errorBody,
    });

    let caught: unknown;
    try {
      await acuityFetch("GET", "/appointments/99999");
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(AcuityApiError);
    if (caught instanceof AcuityApiError) {
      expect(caught.status).toBe(404);
      expect(caught.statusText).toBe("Not Found");
      expect(caught.body).toEqual(errorBody);
    }
  });

  it("retries on 429 with exponential backoff and succeeds on second attempt", async () => {
    vi.useFakeTimers();

    const successResponse = { id: 42, type: "appointment" };
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
        json: async () => ({ error: "rate limit" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => successResponse,
      });

    const fetchPromise = acuityFetch<typeof successResponse>(
      "GET",
      "/appointments",
    );

    // Advance time past the first retry delay (1000ms)
    await vi.advanceTimersByTimeAsync(1000);

    const result = await fetchPromise;

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result).toEqual(successResponse);

    vi.useRealTimers();
  });

  it("sends JSON body for POST requests", async () => {
    const requestBody = {
      appointmentTypeID: 1,
      datetime: "2026-03-21T10:00:00-06:00",
      firstName: "John",
      lastName: "Doe",
      email: "john@example.com",
    };
    const mockResponse = { id: 100, ...requestBody };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      statusText: "Created",
      json: async () => mockResponse,
    });

    const result = await acuityFetch<typeof mockResponse>(
      "POST",
      "/appointments",
      requestBody,
    );

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe("https://acuityscheduling.com/api/v1/appointments");
    expect(options.method).toBe("POST");
    expect(options.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(options.body)).toEqual(requestBody);
    expect(result).toEqual(mockResponse);
  });

  it("throws Error if ACUITY_USER_ID env var is missing", async () => {
    vi.unstubAllEnvs();
    vi.stubEnv("ACUITY_USER_ID", "");
    vi.stubEnv("ACUITY_API_KEY", MOCK_API_KEY);

    await expect(acuityFetch("GET", "/appointments")).rejects.toThrow(
      /ACUITY_USER_ID/,
    );
  });

  it("throws Error if ACUITY_API_KEY env var is missing", async () => {
    vi.unstubAllEnvs();
    vi.stubEnv("ACUITY_USER_ID", MOCK_USER_ID);
    vi.stubEnv("ACUITY_API_KEY", "");

    await expect(acuityFetch("GET", "/appointments")).rejects.toThrow(
      /ACUITY_API_KEY/,
    );
  });
});
