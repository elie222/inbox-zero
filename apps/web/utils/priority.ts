export type PriorityLevel = "low" | "medium" | "high";

export const PRIORITY_MAP = {
  low: 10,
  medium: 50,
  high: 90,
} as const;

export function priorityToNumber(priority: PriorityLevel): number {
  return PRIORITY_MAP[priority];
}

export function numberToPriority(priority: number): PriorityLevel | null {
  switch (priority) {
    case 10:
      return "low";
    case 50:
      return "medium";
    case 90:
      return "high";
    default:
      return null;
  }
}
