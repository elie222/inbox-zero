export async function atMailEngineStartupStage<T>(
  stage: string,
  start: () => T | Promise<T>,
): Promise<T> {
  try {
    return await start();
  } catch (cause) {
    const error = new Error(
      `[${stage}] ${cause instanceof Error ? cause.message : "Unknown failure"}`,
      { cause },
    );
    if (cause instanceof Error) error.name = cause.name;
    throw error;
  }
}
