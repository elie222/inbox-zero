export type SlashTriggerMatch = {
  query: string;
  range: Range;
};

/**
 * Finds a "/query" typed right before a collapsed caret, where the slash
 * starts a line or follows whitespace.
 */
export function findSlashTrigger(range: Range): SlashTriggerMatch | null {
  if (!range.collapsed) return null;
  const node = range.startContainer;
  if (node.nodeType !== Node.TEXT_NODE) return null;

  const text = (node as Text).data.slice(0, range.startOffset);
  const match = /(?:^|[\s ])\/([^\s /]*)$/u.exec(text);
  if (!match) return null;

  const slashOffset = text.length - match[1].length - 1;
  if (slashOffset === 0 && !startsLine(node)) return null;

  const triggerRange = document.createRange();
  triggerRange.setStart(node, slashOffset);
  triggerRange.setEnd(node, range.startOffset);
  return { query: match[1], range: triggerRange };
}

function startsLine(node: Node): boolean {
  const previous = node.previousSibling;
  if (previous) {
    if (previous.nodeName === "BR") return true;
    return /[\s\u00a0]$/u.test(previous.textContent ?? "");
  }
  const parent = node.parentElement;
  if (!parent || isBlock(parent)) return true;
  return startsLine(parent);
}

function isBlock(element: Element) {
  return /^(?:BLOCKQUOTE|DIV|H[1-6]|LI|P|TD|TH)$/u.test(element.nodeName);
}
