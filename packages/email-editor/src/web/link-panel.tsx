import { useId, useState } from "react";
import { isSafeEmailUrl } from "../core/email-profile";
import styles from "./EmailEditor.module.css";

export function LinkPanel({
  initialHref,
  onApply,
  onCancel,
  onRemove,
}: {
  initialHref: string;
  onApply: (href: string) => void;
  onCancel: () => void;
  onRemove: () => void;
}) {
  const [href, setHref] = useState(initialHref);
  const [error, setError] = useState("");
  const inputId = useId();
  const errorId = `${inputId}-error`;

  const apply = () => {
    const normalized = normalizeLinkHref(href);
    if (!normalized || !isSafeEmailUrl(normalized)) {
      setError("Enter a safe web, email, telephone, or in-message link.");
      return;
    }
    onApply(normalized);
  };

  return (
    <div
      aria-label={initialHref ? "Edit link" : "Add link"}
      className={styles.linkPanel}
      data-email-editor-link-dialog=""
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        onCancel();
      }}
      role="dialog"
    >
      <label htmlFor={inputId}>Link address</label>
      <input
        aria-describedby={error ? errorId : undefined}
        aria-invalid={Boolean(error)}
        autoFocus
        className={styles.linkInput}
        id={inputId}
        onChange={(event) => {
          setHref(event.target.value);
          setError("");
        }}
        placeholder="https://example.com"
        type="text"
        value={href}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          apply();
        }}
      />
      {error && (
        <p className={styles.linkError} id={errorId} role="alert">
          {error}
        </p>
      )}
      <div className={styles.linkActions}>
        {initialHref && (
          <button
            className={styles.linkButton}
            onClick={() => openSafeLink(initialHref)}
            type="button"
          >
            Open
          </button>
        )}
        {initialHref && (
          <button
            className={styles.linkButton}
            onClick={onRemove}
            type="button"
          >
            Remove
          </button>
        )}
        <button className={styles.linkButton} onClick={onCancel} type="button">
          Cancel
        </button>
        <button
          className={`${styles.linkButton} ${styles.linkButtonPrimary}`}
          onClick={apply}
          type="button"
        >
          {initialHref ? "Update" : "Add"}
        </button>
      </div>
    </div>
  );
}

export function openSafeLink(value: string) {
  const href = normalizeLinkHref(value);
  if (!isSafeEmailUrl(href)) return;
  window.open(href, "_blank", "noopener,noreferrer");
}

function normalizeLinkHref(value: string) {
  const href = value.trim();
  if (!href) return "";
  if (/^(?:https?:\/\/|mailto:|tel:|#)/iu.test(href)) return href;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(href)) return `mailto:${href}`;
  return `https://${href}`;
}
