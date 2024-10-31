export async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const exponentialBackoff = (retryCount: number, ms: number) =>
  2 ** retryCount * ms;
