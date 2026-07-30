"use client";

import {
  ArrowDownIcon,
  ArrowUpIcon,
  ExternalLinkIcon,
  MailIcon,
  MapPinIcon,
  PencilIcon,
  PhoneIcon,
  Share2Icon,
  XIcon,
} from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import useSWR from "swr";
import type { ContactCardResponse } from "@/app/api/user/contact-card/route";
import { LoadingContent } from "@/components/LoadingContent";
import { toastError, toastSuccess } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAccount } from "@/providers/EmailAccountProvider";
import { upsertContactCardAction } from "@/utils/actions/contact-card";
import {
  CARD_ACCENTS,
  type CardAvatarMode,
  type CardAvatarShape,
  type CardNameFont,
  cardInitials,
  resolveCardAccent,
} from "@/utils/contact-card/appearance";
import { getActionErrorMessage } from "@/utils/error";
import { cn } from "@/utils";

// The My Card drawer from the Contacts v2 design: a live card preview on
// top, analytics + share in view mode, identity and look & feel in edit
// mode. Opens over the contacts page at every width.
export function MyCardDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { data, isLoading, error, mutate } = useSWR<ContactCardResponse>(
    open ? "/api/user/contact-card" : null,
  );
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: Escape closes via the document listener above */}
      <div className="fixed inset-0 z-40 bg-black/55" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 flex w-[min(520px,100vw)] flex-col border-l border-primary/25 bg-background shadow-2xl duration-200 animate-in slide-in-from-right [background-image:linear-gradient(to_bottom,rgba(241,78,35,0.08),rgba(241,78,35,0.02)_180px,transparent_320px)]">
        <div className="flex shrink-0 items-center gap-3 px-6 pt-[calc(1.25rem+env(safe-area-inset-top,0px))]">
          <h2 className="flex-1 font-display text-2xl tracking-tight">
            My card
          </h2>
          {!editing && data?.card && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditing(true)}
            >
              <PencilIcon className="mr-1.5 size-3.5" />
              Edit
            </Button>
          )}
          <Button variant="outline" size="iconSm" onClick={onClose}>
            <span className="sr-only">Close</span>
            <XIcon className="size-4" />
          </Button>
        </div>
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] pt-4">
          <LoadingContent loading={isLoading} error={error}>
            {data && (
              <MyCardBody
                data={data}
                // No card yet: there's nothing to view, go straight to the form
                editing={editing || !data.card}
                startEditing={() => setEditing(true)}
                stopEditing={() => setEditing(false)}
                mutate={mutate}
              />
            )}
          </LoadingContent>
        </div>
      </div>
    </>
  );
}

type CardDraft = {
  slug: string;
  displayName: string;
  headline: string;
  title: string;
  companyName: string;
  email: string;
  phone: string;
  website: string;
  photoUrl: string;
  logoUrl: string;
  location: string;
  linkedinUrl: string;
  xUrl: string;
  instagramUrl: string;
  isActive: boolean;
  avatarMode: CardAvatarMode;
  avatarShape: CardAvatarShape;
  nameFont: CardNameFont;
  accentColor: string;
  accentStripe: boolean;
};

function draftFrom(data: ContactCardResponse): CardDraft {
  const { card, defaults } = data;
  return {
    slug: card?.slug ?? defaults?.slug ?? "",
    displayName: card?.displayName ?? defaults?.displayName ?? "",
    headline: card?.headline ?? "",
    title: card?.title ?? "",
    companyName: card?.companyName ?? "",
    email: card?.email ?? defaults?.email ?? "",
    phone: card?.phone ?? "",
    website: card?.website ?? "",
    photoUrl: card?.photoUrl ?? "",
    logoUrl: card?.logoUrl ?? "",
    location: card?.location ?? "",
    linkedinUrl: card?.linkedinUrl ?? "",
    xUrl: card?.xUrl ?? "",
    instagramUrl: card?.instagramUrl ?? "",
    isActive: card?.isActive ?? true,
    avatarMode: (card?.avatarMode as CardAvatarMode) ?? "initials",
    avatarShape: (card?.avatarShape as CardAvatarShape) ?? "circle",
    nameFont: (card?.nameFont as CardNameFont) ?? "serif",
    accentColor: resolveCardAccent(card?.accentColor),
    accentStripe: card?.accentStripe ?? true,
  };
}

function MyCardBody({
  data,
  editing,
  startEditing,
  stopEditing,
  mutate,
}: {
  data: ContactCardResponse;
  editing: boolean;
  startEditing: () => void;
  stopEditing: () => void;
  mutate: () => void;
}) {
  const { emailAccountId } = useAccount();
  const [draft, setDraft] = useState<CardDraft>(() => draftFrom(data));

  const save = useAction(upsertContactCardAction.bind(null, emailAccountId), {
    onSuccess: () => {
      toastSuccess({ description: "Card saved" });
      mutate();
      stopEditing();
    },
    onError: (actionError) => {
      toastError({ description: getActionErrorMessage(actionError.error) });
    },
  });

  const set = <K extends keyof CardDraft>(key: K, value: CardDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const cancel = () => {
    setDraft(draftFrom(data));
    stopEditing();
  };

  return (
    <>
      <CardPreview draft={draft} />

      {!editing && data.card && (
        <ViewMode data={data} startEditing={startEditing} />
      )}

      {editing && (
        <EditMode
          draft={draft}
          set={set}
          saving={save.isExecuting}
          canCancel={!!data.card}
          onCancel={cancel}
          onSave={() =>
            save.execute({
              slug: draft.slug,
              isActive: draft.isActive,
              displayName: draft.displayName,
              headline: draft.headline,
              title: draft.title,
              companyName: draft.companyName,
              email: draft.email,
              phone: draft.phone,
              website: draft.website,
              photoUrl: draft.photoUrl,
              logoUrl: draft.logoUrl,
              location: draft.location,
              linkedinUrl: draft.linkedinUrl,
              xUrl: draft.xUrl,
              instagramUrl: draft.instagramUrl,
              avatarMode: draft.avatarMode,
              avatarShape: draft.avatarShape,
              nameFont: draft.nameFont,
              accentColor: draft.accentColor as (typeof CARD_ACCENTS)[number],
              accentStripe: draft.accentStripe,
            })
          }
        />
      )}
    </>
  );
}

// The card as people see it, driven live by the draft in both modes
function CardPreview({ draft }: { draft: CardDraft }) {
  const accent = resolveCardAccent(draft.accentColor);
  const radius = draft.avatarShape === "rounded" ? "12px" : "50%";
  const showPhoto = draft.avatarMode === "photo" && !!draft.photoUrl;
  const showLogo = draft.avatarMode === "logo" && !!draft.logoUrl;
  const titleLine = [draft.title, draft.companyName]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className="relative overflow-hidden rounded-[14px] border border-border p-5"
      style={{
        background: `linear-gradient(to bottom right, ${accent}14, transparent 60%)`,
      }}
    >
      {draft.accentStripe && (
        <div
          className="absolute inset-x-0 top-0 h-[3px]"
          style={{
            background: `linear-gradient(to right, ${accent}, transparent)`,
          }}
        />
      )}
      <div className="flex items-center gap-3.5">
        {showPhoto ? (
          <div
            className="size-14 shrink-0 bg-muted bg-cover bg-center"
            style={{
              borderRadius: radius,
              backgroundImage: `url('${draft.photoUrl}')`,
            }}
          />
        ) : showLogo ? (
          <div
            className="size-14 shrink-0 bg-white bg-contain bg-center bg-no-repeat p-2 [background-origin:content-box]"
            style={{
              borderRadius: radius,
              backgroundImage: `url('${draft.logoUrl}')`,
            }}
          />
        ) : (
          <div
            className="flex size-14 shrink-0 items-center justify-center text-xl font-semibold text-white"
            style={{ borderRadius: radius, background: accent }}
          >
            {cardInitials(draft.displayName)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              "text-[22px] tracking-tight",
              draft.nameFont === "serif" ? "font-display" : "font-semibold",
            )}
          >
            {draft.displayName || "Your name"}
          </div>
          {titleLine && (
            <div className="text-[13px] text-muted-foreground">{titleLine}</div>
          )}
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-1.5 border-t border-border/70 pt-3.5 text-[13px] text-foreground/80">
        {draft.email && (
          <div className="flex items-center gap-2">
            <MailIcon className="size-[13px] shrink-0 text-muted-foreground" />
            <span className="min-w-0 truncate">{draft.email}</span>
          </div>
        )}
        {draft.phone && (
          <div className="flex items-center gap-2">
            <PhoneIcon className="size-[13px] shrink-0 text-muted-foreground" />
            {draft.phone}
          </div>
        )}
        {draft.location && (
          <div className="flex items-center gap-2">
            <MapPinIcon className="size-[13px] shrink-0 text-muted-foreground" />
            {draft.location}
          </div>
        )}
      </div>
      <p className="mt-3.5 text-xs text-muted-foreground">
        This is what people see when you share your card or they look you up.
      </p>
    </div>
  );
}

const CLICK_LABELS: Record<string, string> = {
  phone: "Phone number",
  email: "Email address",
  save: "Save to contacts",
  website: "Website",
  linkedin: "LinkedIn",
  x: "X / Twitter",
  instagram: "Instagram",
};

function ViewMode({
  data,
  startEditing,
}: {
  data: ContactCardResponse;
  startEditing: () => void;
}) {
  const { engagement, url } = data;
  const [copied, setCopied] = useState(false);
  if (!engagement || !url) return null;

  const peak = Math.max(...engagement.weekly.map((week) => week.views), 1);
  const isLive = data.card?.isActive !== false;

  const share = async () => {
    if (navigator.share) {
      await navigator.share({ url }).catch(() => undefined);
      return;
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <div>
        <h3 className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
          Card activity, last 30 days
        </h3>
        <div className="grid grid-cols-3 gap-2.5">
          <StatTile label="Views" stat={engagement.views} />
          <StatTile label="Clicks" stat={engagement.clicks} />
          <StatTile label="Saves" stat={engagement.saves} />
        </div>
      </div>

      <div className="rounded-[10px] border border-border bg-card p-3.5">
        <div className="mb-2.5 flex items-baseline justify-between">
          <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
            Views trend
          </h3>
          <span className="text-[11px] text-muted-foreground">weekly</span>
        </div>
        <div className="flex h-16 items-end gap-1.5">
          {engagement.weekly.map((week, index) => (
            <div
              key={week.weekStart}
              title={`${week.views} ${week.views === 1 ? "view" : "views"}`}
              className="flex h-full flex-1 flex-col justify-end"
            >
              <div
                className={cn(
                  "rounded-t-[4px] rounded-b-sm",
                  index === engagement.weekly.length - 1
                    ? "bg-primary"
                    : "bg-primary/35",
                )}
                style={{
                  height: `${Math.max(Math.round((week.views / peak) * 100), week.views ? 6 : 2)}%`,
                }}
              />
            </div>
          ))}
        </div>
        <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground/60">
          <span>{formatWeekLabel(engagement.weekly[0]?.weekStart)}</span>
          <span>{formatWeekLabel(engagement.weekly.at(-1)?.weekStart)}</span>
        </div>
      </div>

      <div className="rounded-[10px] border border-border bg-card p-3.5">
        <h3 className="mb-2.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
          What they clicked
        </h3>
        <div className="flex flex-col gap-2 text-[13px]">
          {engagement.clickBreakdown.map((entry) => (
            <div key={entry.kind} className="flex justify-between">
              <span className="text-muted-foreground">
                {CLICK_LABELS[entry.kind] ?? entry.kind}
              </span>
              <span className="font-semibold tabular-nums">{entry.count}</span>
            </div>
          ))}
          {!engagement.clickBreakdown.length && (
            <p className="text-muted-foreground">
              Nothing yet — taps on your public card show up here.
            </p>
          )}
          {engagement.topReferrer && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Top referrer</span>
              <span className="min-w-0 truncate pl-3 font-semibold">
                {engagement.topReferrer.replace(/^https?:\/\//, "")}
              </span>
            </div>
          )}
          {engagement.lastViewedAt && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Last viewed</span>
              <span className="font-semibold">
                {formatDistanceToNow(new Date(engagement.lastViewedAt), {
                  addSuffix: true,
                })}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" asChild>
          <a href={url} target="_blank" rel="noopener noreferrer">
            <ExternalLinkIcon className="mr-1.5 size-3.5" />
            View public page
          </a>
        </Button>
        <Button variant="outline" className="flex-1" onClick={share}>
          <Share2Icon className="mr-1.5 size-3.5" />
          {copied ? "Link copied" : "Share card"}
        </Button>
      </div>
      {!isLive && (
        <p className="text-xs text-muted-foreground">
          The link is currently off — visitors see a not-found page. Turn it
          back on under{" "}
          <button
            type="button"
            className="underline hover:text-foreground"
            onClick={startEditing}
          >
            Edit
          </button>
          .
        </p>
      )}
    </>
  );
}

function StatTile({
  label,
  stat,
}: {
  label: string;
  stat: { total: number; deltaPct: number | null };
}) {
  return (
    <div className="rounded-[10px] border border-border bg-card p-3">
      <div className="font-display text-2xl leading-none">{stat.total}</div>
      <div className="mt-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/80">
        {label}
      </div>
      {stat.deltaPct !== null && (
        <div
          className={cn(
            "mt-1.5 flex items-center gap-0.5 text-[11px] font-semibold",
            stat.deltaPct >= 0
              ? "text-green-600 dark:text-green-400"
              : "text-red-500 dark:text-red-400",
          )}
        >
          {stat.deltaPct >= 0 ? (
            <ArrowUpIcon className="size-2.5" />
          ) : (
            <ArrowDownIcon className="size-2.5" />
          )}
          {stat.deltaPct >= 0 ? "+" : ""}
          {stat.deltaPct}%
        </div>
      )}
    </div>
  );
}

function EditMode({
  draft,
  set,
  saving,
  canCancel,
  onCancel,
  onSave,
}: {
  draft: CardDraft;
  set: <K extends keyof CardDraft>(key: K, value: CardDraft[K]) => void;
  saving: boolean;
  canCancel: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Field id="mc-name" label="Name">
          <Input
            id="mc-name"
            value={draft.displayName}
            onChange={(event) => set("displayName", event.target.value)}
          />
        </Field>
        <Field id="mc-title" label="Title">
          <Input
            id="mc-title"
            value={draft.title}
            onChange={(event) => set("title", event.target.value)}
          />
        </Field>
        <Field id="mc-company" label="Company">
          <Input
            id="mc-company"
            value={draft.companyName}
            onChange={(event) => set("companyName", event.target.value)}
          />
        </Field>
        <Field id="mc-phone" label="Phone">
          <Input
            id="mc-phone"
            value={draft.phone}
            onChange={(event) => set("phone", event.target.value)}
          />
        </Field>
      </div>
      <Field id="mc-location" label="Location">
        <Input
          id="mc-location"
          placeholder="Tilton, NH"
          value={draft.location}
          onChange={(event) => set("location", event.target.value)}
        />
      </Field>

      <div className="h-px bg-border" />
      <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
        Look &amp; feel
      </h3>

      <div>
        <span className="text-[13px] font-medium">Card image</span>
        <div className="mt-2 flex gap-1.5">
          {(
            [
              { key: "initials", label: "Initials" },
              { key: "photo", label: "My photo" },
              { key: "logo", label: "Company logo" },
            ] as const
          ).map((mode) => (
            <button
              key={mode.key}
              type="button"
              className={cn(
                "flex-1 rounded-lg border px-1.5 py-2.5 text-[11.5px] font-medium",
                draft.avatarMode === mode.key
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-muted/50",
              )}
              onClick={() => set("avatarMode", mode.key)}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>
      {draft.avatarMode === "photo" && (
        <Field id="mc-photo" label="Photo URL">
          <Input
            id="mc-photo"
            placeholder="https://…"
            value={draft.photoUrl}
            onChange={(event) => set("photoUrl", event.target.value)}
          />
        </Field>
      )}
      {draft.avatarMode === "logo" && (
        <Field
          id="mc-logo"
          label="Logo URL"
          hint="Shown on a white tile so dark logos stay visible."
        >
          <Input
            id="mc-logo"
            placeholder="https://…"
            value={draft.logoUrl}
            onChange={(event) => set("logoUrl", event.target.value)}
          />
        </Field>
      )}

      <div>
        <span className="text-[13px] font-medium">Accent color</span>
        <div className="mt-2 flex items-center gap-2">
          {CARD_ACCENTS.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={`Accent ${color}`}
              className={cn(
                "flex size-6 items-center justify-center rounded-full border-2",
                draft.accentColor === color
                  ? "border-foreground"
                  : "border-transparent",
              )}
              onClick={() => set("accentColor", color)}
            >
              <span
                className="size-[13px] rounded-full"
                style={{ background: color }}
              />
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <span className="text-[13px] font-medium">Image shape</span>
          <Segmented
            value={draft.avatarShape}
            options={[
              { key: "circle", label: "Circle" },
              { key: "rounded", label: "Rounded" },
            ]}
            onChange={(value) => set("avatarShape", value)}
          />
        </div>
        <div>
          <span className="text-[13px] font-medium">Name style</span>
          <Segmented
            value={draft.nameFont}
            options={[
              { key: "serif", label: "Serif" },
              { key: "sans", label: "Sans" },
            ]}
            onChange={(value) => set("nameFont", value)}
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div>
          <span className="text-[13px] font-medium">Accent stripe</span>
          <p className="mt-0.5 text-xs text-muted-foreground">
            The colored line across the top of the card.
          </p>
        </div>
        <Switch
          checked={draft.accentStripe}
          onCheckedChange={(checked) => set("accentStripe", checked)}
        />
      </div>

      <div className="h-px bg-border" />
      <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
        Link &amp; details
      </h3>

      <Field id="mc-slug" label="Link">
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-sm text-muted-foreground">/card/</span>
          <Input
            id="mc-slug"
            required
            value={draft.slug}
            onChange={(event) => set("slug", event.target.value)}
          />
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field id="mc-email" label="Email">
          <Input
            id="mc-email"
            type="email"
            value={draft.email}
            onChange={(event) => set("email", event.target.value)}
          />
        </Field>
        <Field id="mc-website" label="Website">
          <Input
            id="mc-website"
            placeholder="https://"
            value={draft.website}
            onChange={(event) => set("website", event.target.value)}
          />
        </Field>
        <Field id="mc-linkedin" label="LinkedIn">
          <Input
            id="mc-linkedin"
            placeholder="linkedin.com/in/you"
            value={draft.linkedinUrl}
            onChange={(event) => set("linkedinUrl", event.target.value)}
          />
        </Field>
        <Field id="mc-x" label="X / Twitter">
          <Input
            id="mc-x"
            placeholder="x.com/you"
            value={draft.xUrl}
            onChange={(event) => set("xUrl", event.target.value)}
          />
        </Field>
        <Field id="mc-instagram" label="Instagram">
          <Input
            id="mc-instagram"
            placeholder="instagram.com/you"
            value={draft.instagramUrl}
            onChange={(event) => set("instagramUrl", event.target.value)}
          />
        </Field>
      </div>
      <Field id="mc-headline" label="About">
        <Textarea
          id="mc-headline"
          rows={3}
          placeholder="A line or two about what you do"
          value={draft.headline}
          onChange={(event) => set("headline", event.target.value)}
        />
      </Field>
      <div className="flex items-center justify-between gap-4">
        <div>
          <Label htmlFor="mc-active">Link is live</Label>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Turn this off and the link shows a not-found page.
          </p>
        </div>
        <Switch
          id="mc-active"
          checked={draft.isActive}
          onCheckedChange={(checked) => set("isActive", checked)}
        />
      </div>

      <div className="flex gap-2">
        <Button
          loading={saving}
          disabled={!draft.displayName.trim() || !draft.slug.trim()}
          onClick={onSave}
        >
          Save
        </Button>
        {canCancel && (
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </>
  );
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { key: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="mt-1.5 inline-flex h-8 items-center gap-0.5 rounded-lg bg-muted p-0.5 text-[12.5px] font-medium">
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          className={cn(
            "rounded-md px-3 py-1",
            value === option.key
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => onChange(option.key)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function formatWeekLabel(dayKey: string | undefined): string {
  if (!dayKey) return "";
  const date = new Date(`${dayKey}T00:00:00`);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
