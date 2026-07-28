"use client";

import { useId, useState } from "react";
import { cardColors, eyebrow, MONO, panel } from "./card-theme";

type Fields = {
  name: string;
  email: string;
  phone: string;
  companyTitle: string;
  note: string;
};

const EMPTY: Fields = {
  name: "",
  email: "",
  phone: "",
  companyTitle: "",
  note: "",
};

export function ExchangePanel({
  slug,
  ownerFirstName,
  onViewCard,
}: {
  slug: string;
  ownerFirstName: string;
  onViewCard: () => void;
}) {
  const [fields, setFields] = useState<Fields>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const set = (key: keyof Fields) => (value: string) =>
    setFields((current) => ({ ...current, [key]: value }));

  const submit = async () => {
    if (!fields.name.trim() || !fields.email.trim()) {
      setError("Name and email are required.");
      return;
    }

    setError(null);
    setIsSending(true);
    try {
      const response = await fetch(`/api/contact-card/${slug}/exchange`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fields.name.trim(),
          email: fields.email.trim(),
          phone: fields.phone.trim() || undefined,
          companyTitle: fields.companyTitle.trim() || undefined,
          note: fields.note.trim() || undefined,
        }),
      });

      if (!response.ok) {
        setError(
          response.status === 429
            ? "That's a few too many tries — give it a minute."
            : "That didn't send. Try again in a moment.",
        );
        return;
      }

      setSubmitted(true);
    } catch {
      setError("That didn't send. Check your connection and try again.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div
      style={{
        flex: "1 1 400px",
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        gap: 20,
      }}
    >
      {submitted ? (
        <div style={panel({ padding: "44px 32px", textAlign: "center" })}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              background: "rgba(74,222,128,.12)",
              border: `1px solid ${cardColors.success}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 18px",
              color: cardColors.success,
              fontSize: 24,
            }}
          >
            ✓
          </div>
          <h2
            style={{
              margin: "0 0 6px",
              fontSize: 24,
              fontWeight: 700,
              letterSpacing: "-.02em",
            }}
          >
            Got it, {firstWord(fields.name) || "friend"}.
          </h2>
          <p
            style={{
              margin: "0 auto",
              maxWidth: 380,
              fontSize: 14,
              color: cardColors.dim,
              textWrap: "pretty",
            }}
          >
            Your details are on their way to {ownerFirstName}. Expect a hello
            soon.
          </p>
          <div
            style={{
              display: "flex",
              gap: 10,
              justifyContent: "center",
              marginTop: 24,
              flexWrap: "wrap",
            }}
          >
            <a
              className="card-accent-btn"
              download
              href={`/api/contact-card/${slug}/vcard`}
              style={{
                background: cardColors.accent,
                color: cardColors.page,
                borderRadius: 6,
                padding: "12px 20px",
                fontSize: 14,
                fontWeight: 600,
                textDecoration: "none",
                cursor: "pointer",
              }}
            >
              ↓ Save {ownerFirstName}'s card
            </a>
            <button
              className="card-outline-btn"
              onClick={onViewCard}
              style={{
                background: cardColors.panelAlt,
                color: cardColors.text,
                border: `1px solid ${cardColors.borderStrong}`,
                borderRadius: 6,
                padding: "12px 20px",
                fontFamily: "inherit",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
              }}
              type="button"
            >
              View full card
            </button>
          </div>
        </div>
      ) : (
        <div style={panel({ padding: "28px 32px 32px" })}>
          <p style={eyebrow(10, ".24em")}>Contact exchange</p>
          <h2
            style={{
              margin: "10px 0 4px",
              fontSize: 24,
              fontWeight: 700,
              letterSpacing: "-.02em",
            }}
          >
            Good meeting you. Your turn.
          </h2>
          <p
            style={{
              margin: "0 0 22px",
              fontSize: 14,
              color: cardColors.dim,
              textWrap: "pretty",
            }}
          >
            Drop your details below and they go straight to {ownerFirstName}.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)",
              gap: 14,
            }}
          >
            <Field
              full
              label="Name *"
              onChange={set("name")}
              placeholder="Jane Rivera"
              value={fields.name}
            />
            <Field
              label="Email *"
              onChange={set("email")}
              placeholder="jane@company.com"
              type="email"
              value={fields.email}
            />
            <Field
              label="Phone"
              onChange={set("phone")}
              placeholder="(555) 000-0000"
              value={fields.phone}
            />
            <Field
              full
              label="Company / title"
              onChange={set("companyTitle")}
              placeholder="Acme Motors · Sales Director"
              value={fields.companyTitle}
            />
            <Field
              full
              label="How we met / note"
              multiline
              onChange={set("note")}
              placeholder="NADA Show, talked EV inventory…"
              value={fields.note}
            />
          </div>

          {error && (
            <p
              style={{
                margin: "14px 0 0",
                fontSize: 13,
                color: cardColors.error,
              }}
            >
              {error}
            </p>
          )}

          <button
            className="card-accent-btn"
            disabled={isSending}
            onClick={submit}
            style={{
              marginTop: 20,
              width: "100%",
              background: cardColors.accent,
              color: cardColors.page,
              border: "none",
              borderRadius: 6,
              padding: "14px 18px",
              fontFamily: "inherit",
              fontSize: 15,
              fontWeight: 600,
              cursor: isSending ? "default" : "pointer",
              opacity: isSending ? 0.7 : 1,
            }}
            type="button"
          >
            {isSending ? "Sending…" : `Send to ${ownerFirstName} →`}
          </button>
          <p
            style={{
              margin: "14px 0 0",
              fontSize: 12,
              color: cardColors.dim,
              textAlign: "center",
            }}
          >
            Your info goes only to {ownerFirstName}. No lists, no spam.
          </p>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  full,
  multiline,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  full?: boolean;
  multiline?: boolean;
  type?: string;
}) {
  const fieldId = useId();
  const inputStyle: React.CSSProperties = {
    background: cardColors.input,
    border: `1px solid ${cardColors.border}`,
    borderRadius: 6,
    padding: "12px 14px",
    color: cardColors.text,
    fontFamily: "inherit",
    fontSize: 15,
    width: "100%",
    boxSizing: "border-box",
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        ...(full ? { gridColumn: "1/-1" } : {}),
      }}
    >
      <label
        htmlFor={fieldId}
        style={{
          fontFamily: MONO,
          fontSize: 10,
          letterSpacing: ".16em",
          textTransform: "uppercase",
          color: cardColors.dim,
        }}
      >
        {label}
      </label>
      {multiline ? (
        <textarea
          className="card-field"
          id={fieldId}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          rows={3}
          style={{ ...inputStyle, resize: "vertical" }}
          value={value}
        />
      ) : (
        <input
          className="card-field"
          id={fieldId}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          style={inputStyle}
          type={type}
          value={value}
        />
      )}
    </div>
  );
}

function firstWord(value: string) {
  return value.trim().split(/\s+/)[0] ?? "";
}
