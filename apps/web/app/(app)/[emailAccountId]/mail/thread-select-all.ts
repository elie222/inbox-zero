const READER_SELECTOR = "[data-mail-reader]";

/**
 * The reader that a select-all press belongs to, if any. A press inside a
 * message body arrives targeted at its frame, and a press after clicking reader
 * text arrives at the body with the caret left in the reader.
 */
export function findSelectAllReader(
  event: KeyboardEvent | undefined,
  { readerFillsView }: { readerFillsView: boolean },
) {
  const target = event?.target instanceof Element ? event.target : null;
  const anchor = document.getSelection()?.anchorNode;
  const anchorElement =
    anchor instanceof Element ? anchor : (anchor?.parentElement ?? null);
  return (
    target?.closest<HTMLElement>(READER_SELECTOR) ??
    anchorElement?.closest<HTMLElement>(READER_SELECTOR) ??
    (readerFillsView
      ? document.querySelector<HTMLElement>(READER_SELECTOR)
      : null)
  );
}

/**
 * Each message body is its own document, and a selection cannot cross
 * documents, so every body is selected separately alongside the reader.
 */
export function selectThreadText(reader: HTMLElement) {
  for (const frame of getMessageFrames(reader)) {
    const frameDocument = frame.contentDocument;
    if (frameDocument?.body)
      frameDocument.getSelection()?.selectAllChildren(frameDocument.body);
  }
  // Copy has to fire in this document, where the whole thread can be read.
  if (
    document.activeElement instanceof HTMLIFrameElement &&
    reader.contains(document.activeElement)
  ) {
    document.activeElement.blur();
  }
  document.getSelection()?.selectAllChildren(reader);
}

export function copySelectedThreadText(event: ClipboardEvent) {
  const reader = getSelectedReader();
  if (!reader || !event.clipboardData) return;
  event.clipboardData.setData("text/plain", getThreadText(reader));
  event.preventDefault();
}

function getSelectedReader() {
  const selection = document.getSelection();
  if (selection?.rangeCount !== 1) return null;
  const range = selection.getRangeAt(0);
  const reader = range.startContainer;
  if (
    !(reader instanceof HTMLElement) ||
    !reader.matches(READER_SELECTOR) ||
    range.endContainer !== reader ||
    range.startOffset !== 0 ||
    range.endOffset !== reader.childNodes.length
  )
    return null;
  return reader;
}

// The reader's own text is read through the selection because, unlike a
// range, it is serialized with line breaks between blocks.
function getThreadText(reader: HTMLElement) {
  const selection = document.getSelection();
  if (!selection) return "";
  const readText = (range: Range) => {
    selection.removeAllRanges();
    selection.addRange(range);
    return selection.toString();
  };

  const parts: string[] = [];
  const range = document.createRange();
  range.setStart(reader, 0);
  for (const frame of getMessageFrames(reader)) {
    range.setEndBefore(frame);
    parts.push(readText(range.cloneRange()));
    parts.push(frame.contentDocument?.body?.innerText ?? "");
    range.setStartAfter(frame);
  }
  range.setEnd(reader, reader.childNodes.length);
  parts.push(readText(range));
  selection.selectAllChildren(reader);

  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join("\n\n");
}

// Frames still being prepared off screen are hidden from the reader.
function getMessageFrames(reader: HTMLElement) {
  return Array.from(reader.querySelectorAll("iframe")).filter(
    (frame) => !frame.closest("[aria-hidden='true']"),
  );
}
