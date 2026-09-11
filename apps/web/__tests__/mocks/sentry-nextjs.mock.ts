import { vi } from "vitest";

export const setTag = vi.fn();
export const setUser = vi.fn();
export const captureException = vi.fn();
export const withServerActionInstrumentation = vi.fn(
  async (_name: string, callback: () => Promise<unknown>) => callback(),
);
