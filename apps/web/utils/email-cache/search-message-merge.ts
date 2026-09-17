import type { SearchMessage } from "./search-query";

export function createSearchMessageAccumulator(maxBodyCharacters?: number) {
  const messages = new Map<
    string,
    {
      message: SearchMessage;
      fetchedAt: number;
      bodyFetchedAt?: number;
    }
  >();
  return {
    add(message: SearchMessage, fetchedAt: number) {
      const previous = messages.get(message.id);
      const metadata =
        previous && previous.fetchedAt > fetchedAt ? previous.message : message;
      const useIncomingBody =
        message.textPlain !== undefined &&
        (previous?.bodyFetchedAt === undefined ||
          fetchedAt >= previous.bodyFetchedAt);
      messages.set(message.id, {
        message: {
          ...metadata,
          textPlain: useIncomingBody
            ? message.textPlain?.slice(0, maxBodyCharacters)
            : previous?.message.textPlain,
        },
        fetchedAt: Math.max(fetchedAt, previous?.fetchedAt ?? fetchedAt),
        bodyFetchedAt: useIncomingBody ? fetchedAt : previous?.bodyFetchedAt,
      });
    },
    messages() {
      return [...messages.values()].map(({ message }) => message);
    },
  };
}
