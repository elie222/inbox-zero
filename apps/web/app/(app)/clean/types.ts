// Define the steps of the flow
export enum CleanStep {
  INTRO = 0,
  ARCHIVE_OR_READ = 1,
  TIME_RANGE = 2,
  LABEL_OPTIONS = 3,
  FINAL_CONFIRMATION = 4,
}

export const timeRangeOptions = [
  { value: "0", label: "All emails" },
  { value: "1", label: "Older than 1 day" },
  { value: "3", label: "Older than 3 days" },
  { value: "7", label: "Older than 1 week", recommended: true },
  { value: "14", label: "Older than 2 weeks" },
  { value: "30", label: "Older than 1 month" },
  { value: "90", label: "Older than 3 months" },
  { value: "365", label: "Older than 1 year" },
];
