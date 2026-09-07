import { useState } from "react";
import styles from "./EmailEditor.module.css";

export type RenderedPreservedEmailBlock = {
  id: string;
  kind: "quote" | "signature" | "footer";
  previewHtml: string;
  collapsed?: boolean;
};

export function PreservedBlockDetails({
  block,
  onRemove,
}: {
  block: RenderedPreservedEmailBlock;
  onRemove: () => void;
}) {
  const title = PRESERVED_BLOCK_TITLES[block.kind];
  const isQuote = block.kind === "quote";
  const [open, setOpen] = useState(!isQuote || !block.collapsed);
  const previewDocument = `<!doctype html><html><head><meta name="color-scheme" content="light"><style>html,body{margin:0;padding:0;background:#fff;color:#242424;font:13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}body{padding:8px}img{max-width:100%;height:auto}table{max-width:100%}a{color:#2563eb}</style></head><body>${block.previewHtml}</body></html>`;

  return (
    <details
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary
        aria-label={
          isQuote ? `${open ? "Hide" : "Show"} quoted message` : undefined
        }
        className={styles.preservedSummary}
      >
        <span aria-hidden>{isQuote ? "⋯" : "—"}</span>
        {!isQuote && (
          <>
            <span>{title}</span>
            <button
              aria-label={`Remove ${title.toLowerCase()}`}
              className={styles.removePreservedButton}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onRemove();
              }}
              type="button"
            >
              ×
            </button>
          </>
        )}
      </summary>
      <iframe
        className={PRESERVED_BLOCK_PREVIEW_CLASSES[block.kind]}
        sandbox=""
        srcDoc={previewDocument}
        tabIndex={-1}
        title={`${title} preview`}
      />
    </details>
  );
}

const PRESERVED_BLOCK_TITLES: Record<
  RenderedPreservedEmailBlock["kind"],
  string
> = {
  quote: "Quoted message",
  signature: "Signature",
  footer: "Footer",
};

const PRESERVED_BLOCK_PREVIEW_CLASSES: Record<
  RenderedPreservedEmailBlock["kind"],
  string
> = {
  quote: styles.quotePreview,
  signature: styles.signaturePreview,
  footer: styles.footerPreview,
};
