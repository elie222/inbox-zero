// apps/web/utils/chief-of-staff/acuity/actions.ts

import { acuityFetch } from "./client";

export interface AcuityAppointment {
  appointmentTypeID: number;
  canceled: boolean;
  datetime: string;
  email: string;
  firstName: string;
  id: number;
  lastName: string;
  [key: string]: unknown;
}

interface BookAppointmentParams {
  appointmentTypeID: number;
  datetime: string;
  email: string;
  firstName: string;
  lastName: string;
  notes?: string;
  phone?: string;
}

export async function bookAppointment(
  params: BookAppointmentParams,
): Promise<AcuityAppointment> {
  return acuityFetch<AcuityAppointment>("POST", "/appointments", params);
}

export async function rescheduleAppointment(
  appointmentId: number,
  datetime: string,
): Promise<AcuityAppointment> {
  return acuityFetch<AcuityAppointment>(
    "PUT",
    `/appointments/${appointmentId}/reschedule`,
    { datetime },
  );
}

export async function cancelAppointment(
  appointmentId: number,
): Promise<AcuityAppointment> {
  return acuityFetch<AcuityAppointment>(
    "PUT",
    `/appointments/${appointmentId}/cancel`,
    undefined,
  );
}

export async function getClientAppointments(
  email: string,
): Promise<AcuityAppointment[]> {
  return acuityFetch<AcuityAppointment[]>(
    "GET",
    `/appointments?email=${encodeURIComponent(email)}`,
  );
}
