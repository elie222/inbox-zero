import { SpamTokenizer } from "./tokenizer";
import { extractorVersion, segmentText } from "./extractor";

export async function tokenizeWithLanguage(
  collect: (tokenizer: SpamTokenizer) => void,
) {
  if (process.platform !== "darwin") {
    const tokenizer = new SpamTokenizer(extractorVersion());
    collect(tokenizer);
    return tokenizer;
  }
  const requests = new Set<string>();
  const first = new SpamTokenizer(extractorVersion(), (text) => {
    if ([...text].some((character) => character.codePointAt(0)! > 127))
      requests.add(text);
    return;
  });
  collect(first);
  if (!requests.size) return first;
  const segments = await segmentText([...requests]);
  const tokenizer = new SpamTokenizer(extractorVersion(), (text) =>
    segments.get(text),
  );
  collect(tokenizer);
  return tokenizer;
}
