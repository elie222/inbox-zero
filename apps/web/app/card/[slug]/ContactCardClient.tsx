"use client";

import { useEffect, useState } from "react";
import { LogoMark } from "@/components/Logo";
import type { PublicContactCard } from "@/utils/contact-card/public";
import { CardSky, CardStyles } from "./card-styles";
import { cardColors, eyebrow, MONO, panel } from "./card-theme";
import { ExchangePanel } from "./ExchangePanel";

type Mode = "card" | "exchange";

export function ContactCardClient({ card }: { card: PublicContactCard }) {
  useViewBeacon(card.slug);
  const [mode, setMode] = useState<Mode>("card");

  // ?mode=exchange lets the owner share a link that opens on the form
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("mode");
    if (requested === "exchange") setMode("exchange");
  }, []);

  const rows = buildRows(card);
  const socials = buildSocials(card);
  const firstName = firstNameOf(card.displayName);

  return (
    <>
      <CardStyles />
      <div
        style={{
          minHeight: "100vh",
          background: cardColors.page,
          fontFamily: "var(--font-space-grotesk), system-ui, sans-serif",
          color: cardColors.text,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "0 20px 64px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <CardSky />

        <div
          style={{
            width: "100%",
            maxWidth: mode === "exchange" ? 1120 : 640,
            display: "flex",
            flexDirection: "column",
            gap: 20,
            position: "relative",
            transition: "max-width .35s ease",
          }}
        >
          <header
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "20px 4px 0",
              flexWrap: "wrap",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <LogoMark className="h-[34px] w-auto" />
              <span style={eyebrow(10, ".24em")}>Digital contact</span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <TabButton
                active={mode === "card"}
                onClick={() => setMode("card")}
              >
                Card
              </TabButton>
              <TabButton
                active={mode === "exchange"}
                onClick={() => setMode("exchange")}
              >
                Exchange
              </TabButton>
            </div>
          </header>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 20,
              alignItems: "flex-start",
            }}
          >
            <div
              style={{
                flex: "1 1 420px",
                minWidth: 0,
                display: "flex",
                flexDirection: "column",
                gap: 20,
              }}
            >
              <section style={panel({ overflow: "hidden" })}>
                <div
                  style={{
                    height: 6,
                    background: `linear-gradient(90deg,${cardColors.accent},${cardColors.accentHover} 60%,${cardColors.gold})`,
                  }}
                />
                <div
                  style={{
                    padding: "32px 32px 28px",
                    display: "flex",
                    gap: 24,
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <Avatar card={card} />
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <h1
                      style={{
                        margin: 0,
                        fontSize: 34,
                        fontWeight: 700,
                        letterSpacing: "-.02em",
                        lineHeight: 1.1,
                      }}
                    >
                      {card.displayName}
                    </h1>
                    {card.title && (
                      <p
                        style={{
                          margin: "6px 0 0",
                          fontSize: 15,
                          color: cardColors.muted,
                        }}
                      >
                        {card.title}
                      </p>
                    )}
                    {card.companyName && (
                      <p style={{ ...eyebrow(11, ".14em"), margin: "2px 0 0" }}>
                        {card.companyName}
                      </p>
                    )}
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    padding: "0 32px 28px",
                    flexWrap: "wrap",
                  }}
                >
                  <a
                    className="card-accent-btn"
                    download
                    href={`/api/contact-card/${card.slug}/vcard`}
                    style={{
                      flex: 1,
                      minWidth: 160,
                      background: cardColors.accent,
                      color: cardColors.page,
                      borderRadius: 6,
                      padding: "13px 18px",
                      fontSize: 14,
                      fontWeight: 600,
                      textAlign: "center",
                      textDecoration: "none",
                      cursor: "pointer",
                    }}
                  >
                    ↓ Save contact
                  </a>
                  {card.email && (
                    <a
                      className="card-outline-btn"
                      href={`mailto:${card.email}`}
                      style={{
                        flex: 1,
                        minWidth: 160,
                        background: cardColors.panelAlt,
                        color: cardColors.text,
                        border: `1px solid ${cardColors.borderStrong}`,
                        borderRadius: 6,
                        padding: "12px 18px",
                        fontSize: 14,
                        fontWeight: 600,
                        textAlign: "center",
                        textDecoration: "none",
                      }}
                    >
                      ✉ Email {firstName}
                    </a>
                  )}
                </div>
              </section>

              {rows.length > 0 && (
                <section style={panel({ padding: "8px 0" })}>
                  {rows.map((row, index) => (
                    <a
                      className="card-link card-row"
                      href={row.href}
                      key={row.label}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 18,
                        padding: "16px 28px",
                        borderBottom:
                          index === rows.length - 1
                            ? "none"
                            : `1px solid ${cardColors.panelAlt}`,
                      }}
                      {...(row.external
                        ? { target: "_blank", rel: "noopener noreferrer" }
                        : {})}
                    >
                      <span
                        style={{
                          ...eyebrow(10, ".18em", cardColors.dim),
                          width: 88,
                          flex: "0 0 auto",
                        }}
                      >
                        {row.label}
                      </span>
                      <span
                        style={{
                          fontSize: 15,
                          fontWeight: 500,
                          minWidth: 0,
                          overflowWrap: "anywhere",
                        }}
                      >
                        {row.value}
                      </span>
                      <span
                        style={{
                          marginLeft: "auto",
                          color: cardColors.accent,
                          fontSize: 14,
                        }}
                      >
                        →
                      </span>
                    </a>
                  ))}
                </section>
              )}

              {socials.length > 0 && (
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {socials.map((social) => (
                    <a
                      className="card-link card-chip"
                      href={social.href}
                      key={social.tag}
                      rel="noopener noreferrer"
                      style={{
                        flex: 1,
                        minWidth: 140,
                        background: cardColors.panel,
                        border: `1px solid ${cardColors.border}`,
                        borderRadius: 10,
                        padding: "14px 18px",
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                      }}
                      target="_blank"
                    >
                      <span style={eyebrow(10, ".14em", cardColors.accent)}>
                        {social.tag}
                      </span>
                      <span style={{ fontSize: 14, fontWeight: 500 }}>
                        {social.name}
                      </span>
                    </a>
                  ))}
                </div>
              )}

              {mode === "card" && (
                <p
                  style={{
                    margin: "4px 4px 0",
                    fontSize: 13,
                    color: cardColors.dim,
                    textWrap: "pretty",
                  }}
                >
                  Met somewhere and want to swap details?{" "}
                  <button
                    onClick={() => setMode("exchange")}
                    style={{
                      background: "none",
                      border: "none",
                      padding: 0,
                      font: "inherit",
                      color: cardColors.accent,
                      cursor: "pointer",
                    }}
                    type="button"
                  >
                    Send me your info →
                  </button>
                </p>
              )}
            </div>

            {mode === "exchange" && (
              <ExchangePanel
                onViewCard={() => setMode("card")}
                ownerFirstName={firstName}
                slug={card.slug}
              />
            )}
          </div>

          {card.companyName && (
            <p
              style={{
                ...eyebrow(10, ".18em", cardColors.dim),
                margin: "8px auto 0",
                textAlign: "center",
              }}
            >
              {card.companyName}
            </p>
          )}
        </div>
      </div>
    </>
  );
}

// Counted client-side so prefetches and metadata generation don't register
// as views. Fire-and-forget: a failed count must never break the page.
function useViewBeacon(slug: string) {
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/contact-card/${slug}/view`, {
      method: "POST",
      signal: controller.signal,
    }).catch(() => {
      // A blocked or offline beacon just means this view goes uncounted
    });
    return () => controller.abort();
  }, [slug]);
}

function Avatar({ card }: { card: PublicContactCard }) {
  const base = {
    width: 92,
    height: 92,
    borderRadius: "50%",
    flex: "0 0 auto",
    border: `2px solid ${cardColors.borderStrong}`,
  } as const;

  if (card.photoUrl) {
    return (
      // The host is whatever the cardholder pasted, so next/image would need
      // it allowlisted ahead of time
      // biome-ignore lint/performance/noImgElement: arbitrary remote host
      <img
        alt=""
        height={92}
        src={card.photoUrl}
        style={{ ...base, objectFit: "cover" }}
        width={92}
      />
    );
  }

  return (
    <div
      style={{
        ...base,
        background: cardColors.panelAlt,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
        fontSize: 30,
        letterSpacing: "-.02em",
        color: cardColors.accent,
      }}
    >
      {initialsOf(card.displayName)}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? cardColors.accent : cardColors.panelAlt,
        color: active ? cardColors.page : cardColors.muted,
        border: `1px solid ${active ? cardColors.accent : cardColors.borderStrong}`,
        borderRadius: 6,
        padding: "7px 16px",
        fontFamily: MONO,
        fontSize: 10,
        letterSpacing: ".14em",
        textTransform: "uppercase",
        cursor: "pointer",
      }}
      type="button"
    >
      {children}
    </button>
  );
}

type CardRow = {
  label: string;
  value: string;
  href: string;
  external: boolean;
};

// Only the fields that are filled in — an empty slot would read as broken
// rather than deliberate
function buildRows(card: PublicContactCard): CardRow[] {
  const rows: CardRow[] = [];

  if (card.phone) {
    rows.push({
      label: "Mobile",
      value: card.phone,
      href: `tel:${card.phone.replace(/[^\d+]/g, "")}`,
      external: false,
    });
  }
  if (card.email) {
    rows.push({
      label: "Email",
      value: card.email,
      href: `mailto:${card.email}`,
      external: false,
    });
  }
  if (card.website) {
    rows.push({
      label: "Web",
      value: card.website.replace(/^https?:\/\//, ""),
      href: card.website,
      external: true,
    });
  }
  if (card.location) {
    rows.push({
      label: "HQ",
      value: card.location,
      href: `https://maps.google.com/?q=${encodeURIComponent(card.location)}`,
      external: true,
    });
  }

  return rows;
}

type CardSocial = { tag: string; name: string; href: string };

function buildSocials(card: PublicContactCard): CardSocial[] {
  const socials: CardSocial[] = [];

  if (card.linkedinUrl) {
    socials.push({ tag: "in", name: "LinkedIn", href: card.linkedinUrl });
  }
  if (card.xUrl) {
    socials.push({ tag: "x", name: "X / Twitter", href: card.xUrl });
  }
  if (card.instagramUrl) {
    socials.push({ tag: "ig", name: "Instagram", href: card.instagramUrl });
  }

  return socials;
}

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

function firstNameOf(name: string) {
  return name.trim().split(/\s+/)[0] || name;
}
