import { describe, it, expect, vi, beforeEach } from "vitest";
import { getAvailableDates, getAvailableTimes } from "./availability";

vi.mock("./client");

describe("getAvailableDates", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns an array of date strings", async () => {
    const { acuityFetch } = await import("./client");
    vi.mocked(acuityFetch).mockResolvedValueOnce([
      { date: "2026-03-21" },
      { date: "2026-03-22" },
      { date: "2026-03-23" },
    ]);

    const result = await getAvailableDates(123, "2026-03");

    expect(acuityFetch).toHaveBeenCalledWith(
      "GET",
      "/availability/dates?appointmentTypeID=123&month=2026-03",
    );
    expect(result).toEqual(["2026-03-21", "2026-03-22", "2026-03-23"]);
  });

  it("returns an empty array when no dates are available", async () => {
    const { acuityFetch } = await import("./client");
    vi.mocked(acuityFetch).mockResolvedValueOnce([]);

    const result = await getAvailableDates(456, "2026-04");

    expect(result).toEqual([]);
  });
});

describe("getAvailableTimes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns an array of AcuityTime objects", async () => {
    const { acuityFetch } = await import("./client");
    const mockTimes = [
      { time: "2026-03-21T09:00:00-06:00" },
      { time: "2026-03-21T10:00:00-06:00" },
    ];
    vi.mocked(acuityFetch).mockResolvedValueOnce(mockTimes);

    const result = await getAvailableTimes(123, "2026-03-21");

    expect(acuityFetch).toHaveBeenCalledWith(
      "GET",
      "/availability/times?appointmentTypeID=123&date=2026-03-21",
    );
    expect(result).toEqual(mockTimes);
  });

  it("returns an empty array when no times are available", async () => {
    const { acuityFetch } = await import("./client");
    vi.mocked(acuityFetch).mockResolvedValueOnce([]);

    const result = await getAvailableTimes(789, "2026-03-22");

    expect(result).toEqual([]);
  });
});
