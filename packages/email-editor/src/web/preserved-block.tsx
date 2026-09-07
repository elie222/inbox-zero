import { createContext, type MouseEvent, useContext } from "react";
import styles from "./EmailEditor.module.css";

export type RenderedPreservedEmailBlock = {
  id: string;
  kind: "quote" | "signature";
  previewHtml: string;
};

export type ActivePreservedBlock = Pick<
  RenderedPreservedEmailBlock,
  "id" | "kind"
>;

export type PreservedBlocksState = {
  blocks: ActivePreservedBlock[];
  expanded: boolean;
  toggle: () => void;
};

// Signature and quote share one "⋯" toggle so the composer reads like a plain
// email body with hidden trailing content, not a stack of labelled sections.
export const PreservedBlocksContext = createContext<PreservedBlocksState>({
  blocks: [],
  expanded: false,
  toggle: () => {},
});

export function PreservedBlockView({
  block,
  onRemove,
}: {
  block: RenderedPreservedEmailBlock;
  onRemove: () => void;
}) {
  const { blocks, expanded, toggle } = useContext(PreservedBlocksContext);
  const showToggle = blocks[0]?.id === block.id;
  const hiddenContent = [
    blocks.some((candidate) => candidate.kind === "signature") && "signature",
    blocks.some((candidate) => candidate.kind === "quote") && "quoted message",
  ]
    .filter(Boolean)
    .join(" and ");

  return (
    <>
      {showToggle && (
        <button
          aria-expanded={expanded}
          aria-label={`${expanded ? "Hide" : "Show"} ${hiddenContent}`}
          className={styles.preservedToggle}
          onClick={toggle}
          onMouseDown={(event) => event.preventDefault()}
          type="button"
        >
          ⋯
        </button>
      )}
      {expanded && block.kind === "signature" && (
        <div className={styles.signatureContent}>
          <button
            aria-label="Remove signature"
            className={styles.removePreservedButton}
            onClick={onRemove}
            type="button"
          >
            ×
          </button>
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: the handler only suppresses link navigation; keyboard activation of a link also dispatches click. */}
          <div
            className={styles.signatureHtml}
            // biome-ignore lint/security/noDangerouslySetInnerHtml: core sanitization removes active content before the signature is rendered inline.
            dangerouslySetInnerHTML={{ __html: block.previewHtml }}
            onClick={preventLinkNavigation}
          />
        </div>
      )}
      {expanded && block.kind === "quote" && (
        <iframe
          className={styles.quotePreview}
          sandbox=""
          srcDoc={`<!doctype html><html><head><meta name="color-scheme" content="light"><style>html,body{margin:0;padding:0;background:#fff;color:#242424;font:13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}body{padding:8px}img{max-width:100%;height:auto}table{max-width:100%}a{color:#2563eb}</style></head><body>${block.previewHtml}</body></html>`}
          tabIndex={-1}
          title="Quoted message preview"
        />
      )}
    </>
  );
}

// Signature links stay visible but inert while composing, whether activated by
// mouse or keyboard.
function preventLinkNavigation(event: MouseEvent<HTMLDivElement>) {
  if ((event.target as HTMLElement).closest("a")) event.preventDefault();
}
