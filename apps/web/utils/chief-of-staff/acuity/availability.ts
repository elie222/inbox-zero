// apps/web/utils/chief-of-staff/acuity/availability.ts

import { acuityFetch } from "./client";

interface AcuityDate {
  date: string;
}

export interface AcuityTime {
  time: string;
}

export async function getAvailableDates(
  appointmentTypeId: number,
  month: string,
): Promise<string[]> {
  const dates = await acuityFetch<AcuityDate[]>(
    "GET",
    `/availability/dates?appointmentTypeID=${appointmentTypeId}&month=${month}`,
  );
  return dates.map((d) => d.date);
}

export async function getAvailableTimes(
  appointmentTypeId: number,
  date: string,
): Promise<AcuityTime[]> {
  return acuityFetch<AcuityTime[]>(
    "GET",
    `/availability/times?appointmentTypeID=${appointmentTypeId}&date=${date}`,
  );
}
