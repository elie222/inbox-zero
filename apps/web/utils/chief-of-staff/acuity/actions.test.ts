import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  bookAppointment,
  rescheduleAppointment,
  cancelAppointment,
  getClientAppointments,
} from "./actions";

vi.mock("./client");

describe("bookAppointment", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("sends a POST request to /appointments with booking params", async () => {
    const { acuityFetch } = await import("./client");
    const mockAppointment = {
      id: 101,
      firstName: "Jane",
      lastName: "Smith",
      email: "jane@example.com",
      datetime: "2026-03-21T10:00:00-06:00",
      appointmentTypeID: 42,
      canceled: false,
    };
    vi.mocked(acuityFetch).mockResolvedValueOnce(mockAppointment);

    const params = {
      appointmentTypeID: 42,
      datetime: "2026-03-21T10:00:00-06:00",
      firstName: "Jane",
      lastName: "Smith",
      email: "jane@example.com",
      phone: "555-1234",
      notes: "First visit",
    };

    const result = await bookAppointment(params);

    expect(acuityFetch).toHaveBeenCalledWith("POST", "/appointments", params);
    expect(result).toEqual(mockAppointment);
  });

  it("works without optional fields (phone, notes)", async () => {
    const { acuityFetch } = await import("./client");
    const mockAppointment = {
      id: 202,
      firstName: "Bob",
      lastName: "Jones",
      email: "bob@example.com",
      datetime: "2026-03-22T14:00:00-06:00",
      appointmentTypeID: 7,
      canceled: false,
    };
    vi.mocked(acuityFetch).mockResolvedValueOnce(mockAppointment);

    const params = {
      appointmentTypeID: 7,
      datetime: "2026-03-22T14:00:00-06:00",
      firstName: "Bob",
      lastName: "Jones",
      email: "bob@example.com",
    };

    const result = await bookAppointment(params);

    expect(acuityFetch).toHaveBeenCalledWith("POST", "/appointments", params);
    expect(result).toEqual(mockAppointment);
  });
});

describe("rescheduleAppointment", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("sends a PUT request to /appointments/:id/reschedule with new datetime", async () => {
    const { acuityFetch } = await import("./client");
    const mockAppointment = {
      id: 101,
      firstName: "Jane",
      lastName: "Smith",
      email: "jane@example.com",
      datetime: "2026-03-25T11:00:00-06:00",
      appointmentTypeID: 42,
      canceled: false,
    };
    vi.mocked(acuityFetch).mockResolvedValueOnce(mockAppointment);

    const result = await rescheduleAppointment(
      101,
      "2026-03-25T11:00:00-06:00",
    );

    expect(acuityFetch).toHaveBeenCalledWith(
      "PUT",
      "/appointments/101/reschedule",
      { datetime: "2026-03-25T11:00:00-06:00" },
    );
    expect(result).toEqual(mockAppointment);
  });
});

describe("cancelAppointment", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("sends a PUT request to /appointments/:id/cancel", async () => {
    const { acuityFetch } = await import("./client");
    const mockAppointment = {
      id: 101,
      firstName: "Jane",
      lastName: "Smith",
      email: "jane@example.com",
      datetime: "2026-03-21T10:00:00-06:00",
      appointmentTypeID: 42,
      canceled: true,
    };
    vi.mocked(acuityFetch).mockResolvedValueOnce(mockAppointment);

    const result = await cancelAppointment(101);

    expect(acuityFetch).toHaveBeenCalledWith(
      "PUT",
      "/appointments/101/cancel",
      undefined,
    );
    expect(result).toEqual(mockAppointment);
  });
});

describe("getClientAppointments", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("fetches appointments with URL-encoded email", async () => {
    const { acuityFetch } = await import("./client");
    const mockAppointments = [
      {
        id: 101,
        firstName: "Jane",
        lastName: "Smith",
        email: "jane+test@example.com",
        datetime: "2026-03-21T10:00:00-06:00",
        appointmentTypeID: 42,
        canceled: false,
      },
    ];
    vi.mocked(acuityFetch).mockResolvedValueOnce(mockAppointments);

    const result = await getClientAppointments("jane+test@example.com");

    expect(acuityFetch).toHaveBeenCalledWith(
      "GET",
      `/appointments?email=${encodeURIComponent("jane+test@example.com")}`,
    );
    expect(result).toEqual(mockAppointments);
  });

  it("returns empty array when client has no appointments", async () => {
    const { acuityFetch } = await import("./client");
    vi.mocked(acuityFetch).mockResolvedValueOnce([]);

    const result = await getClientAppointments("nobody@example.com");

    expect(result).toEqual([]);
  });
});
