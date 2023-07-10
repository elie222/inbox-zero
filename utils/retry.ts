export function withRetry<T>(
  fn: (...args: any[]) => Promise<T>,
  retries = 3,
  delay = 20
) {
  return async function (...args: any[]) {
    let lastError;
    for (let i = 0; i < retries; i++) {
      try {
        return await fn(...args);
      } catch (error) {
        lastError = error;
        await sleep(delay);
      }
    }
    throw lastError;
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
