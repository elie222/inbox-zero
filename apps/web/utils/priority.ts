export type PriorityLevel = "low" | "medium" | "high";

export const PRIORITY_MAP: Record<PriorityLevel, number> = {
  low: 10,
  medium: 50,
  high: 90,
} as const;

export function priorityToNumber(priority: PriorityLevel): number {
  return PRIORITY_MAP[priority];
}

export function numberToPriority(priority: number): PriorityLevel | null {
  const entry = Object.entries(PRIORITY_MAP).find(
    ([, value]) => value === priority,
  );
  return entry ? (entry[0] as PriorityLevel) : null;
}
