import { useState } from "react";
import styles from "./EmailEditor.module.css";

export type RenderedPreservedEmailBlock = {
  id: string;
  kind: "quote" | "signature";
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
  const title = block.kind === "signature" ? "Signature" : "Quoted message";
  const [open, setOpen] = useState(
    block.kind === "signature" || !block.collapsed,
  );
  const previewDocument = `<!doctype html><html><head><meta name="color-scheme" content="light"><style>html,body{margin:0;padding:0;background:#fff;color:#242424;font:13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}body{padding:8px}img{max-width:100%;height:auto}table{max-width:100%}a{color:#2563eb}</style></head><body>${block.previewHtml}</body></html>`;

  return (
    <details
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary
        aria-label={
          block.kind === "quote"
            ? `${open ? "Hide" : "Show"} quoted message`
            : undefined
        }
        className={styles.preservedSummary}
      >
        <span aria-hidden>{block.kind === "quote" ? "⋯" : "—"}</span>
        {block.kind === "signature" && (
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
        className={
          block.kind === "signature"
            ? styles.signaturePreview
            : styles.quotePreview
        }
        sandbox=""
        srcDoc={previewDocument}
        tabIndex={-1}
        title={`${title} preview`}
      />
    </details>
  );
}
