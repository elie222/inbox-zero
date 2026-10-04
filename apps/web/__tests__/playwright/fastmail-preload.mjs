const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(input instanceof Request ? input.url : input.toString());
  if (url.origin === "https://api.fastmail.com") {
    if (!process.env.PLAYWRIGHT_FASTMAIL_BASE_URL)
      throw new Error("Fastmail browser tests require a local fixture server");
    const destination = new URL(
      url.pathname + url.search,
      process.env.PLAYWRIGHT_FASTMAIL_BASE_URL,
    );
    return realFetch(
      input instanceof Request ? new Request(destination, input) : destination,
      init,
    );
  }
  return realFetch(input, init);
};
