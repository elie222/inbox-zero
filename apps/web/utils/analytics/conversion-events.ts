export const CONVERSION_EVENT_PARAM = "conversion_event";
export const CONVERSION_EVENT_ID_PARAM = "conversion_event_id";
export const CONVERSION_BROWSER_EVENT = "inbox-zero:conversion";

export type ConversionEventName = "registration_completed" | "trial_started";

export type ConversionEvent = {
  name: ConversionEventName;
  id?: string;
  properties?: Record<string, string | number | boolean | null>;
};
