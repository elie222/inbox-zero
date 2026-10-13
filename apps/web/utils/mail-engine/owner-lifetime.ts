export async function holdMailEngineOwner(
  signal: AbortSignal,
  start: () => Promise<() => Promise<void>>,
) {
  const close = await start();
  try {
    await new Promise<void>((resolve) => {
      if (signal.aborted) resolve();
      else signal.addEventListener("abort", () => resolve(), { once: true });
    });
  } finally {
    // The next owner must not open OPFS while this owner's handles are closing.
    await close();
  }
}
