import styles from "./EmailEditor.module.css";

export type RenderedPreservedEmailBlock = {
  id: string;
  kind: "quote" | "signature";
  previewHtml: string;
  // The signature wrapped in the editor's signature container.
  editableHtml?: string;
};

export type ActivePreservedBlock = Pick<
  RenderedPreservedEmailBlock,
  "id" | "kind"
>;

// Signature and quote share one "⋯" toggle so the composer reads like a plain
// email body with hidden trailing content, not a stack of labelled sections.
export function PreservedBlocksToggle({
  blocks,
  expanded,
  onToggle,
}: {
  blocks: ActivePreservedBlock[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const hiddenContent = [
    blocks.some((candidate) => candidate.kind === "signature") && "signature",
    blocks.some((candidate) => candidate.kind === "quote") && "quoted message",
  ]
    .filter(Boolean)
    .join(" and ");

  return (
    <button
      aria-expanded={expanded}
      aria-label={`${expanded ? "Hide" : "Show"} ${hiddenContent}`}
      className={styles.preservedToggle}
      onClick={onToggle}
      onMouseDown={(event) => event.preventDefault()}
      type="button"
    >
      ⋯
    </button>
  );
}

// Nothing in a quote preview may reach the network, even if the sanitizer
// misses something.
const PREVIEW_CONTENT_POLICY =
  "default-src 'none'; img-src data:; style-src 'unsafe-inline'";

export function QuotePreview({ previewHtml }: { previewHtml: string }) {
  return (
    <iframe
      className={styles.quotePreview}
      sandbox=""
      srcDoc={`<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${PREVIEW_CONTENT_POLICY}"><meta name="color-scheme" content="light"><style>html,body{margin:0;padding:0;background:#fff;color:#242424;font:13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}body{padding:8px}img{max-width:100%;height:auto}table{max-width:100%}a{color:#2563eb}</style></head><body>${previewHtml}</body></html>`}
      tabIndex={-1}
      title="Quoted message preview"
    />
  );
}
