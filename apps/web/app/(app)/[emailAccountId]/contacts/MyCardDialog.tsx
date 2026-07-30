"use client";

import { CheckIcon, CopyIcon, ExternalLinkIcon } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { useForm } from "react-hook-form";
import useSWR from "swr";
import type { ContactCardResponse } from "@/app/api/user/contact-card/route";
import { LoadingContent } from "@/components/LoadingContent";
import { toastError, toastSuccess } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAccount } from "@/providers/EmailAccountProvider";
import { upsertContactCardAction } from "@/utils/actions/contact-card";
import { getActionErrorMessage } from "@/utils/error";

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

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>My card</DialogTitle>
        </DialogHeader>
        <LoadingContent loading={isLoading} error={error}>
          {data && <MyCardForm data={data} mutate={mutate} />}
        </LoadingContent>
      </DialogContent>
    </Dialog>
  );
}

function MyCardForm({
  data,
  mutate,
}: {
  data: ContactCardResponse;
  mutate: () => void;
}) {
  const { emailAccountId } = useAccount();
  const { card, defaults, url, stats } = data;
  const [isActive, setIsActive] = useState(card?.isActive ?? true);

  const { register, handleSubmit } = useForm<{
    slug: string;
    displayName: string;
    headline: string;
    title: string;
    companyName: string;
    email: string;
    phone: string;
    website: string;
    photoUrl: string;
    location: string;
    linkedinUrl: string;
    xUrl: string;
    instagramUrl: string;
  }>({
    defaultValues: {
      slug: card?.slug ?? defaults?.slug ?? "",
      displayName: card?.displayName ?? defaults?.displayName ?? "",
      headline: card?.headline ?? "",
      title: card?.title ?? "",
      companyName: card?.companyName ?? "",
      email: card?.email ?? defaults?.email ?? "",
      phone: card?.phone ?? "",
      website: card?.website ?? "",
      photoUrl: card?.photoUrl ?? "",
      location: card?.location ?? "",
      linkedinUrl: card?.linkedinUrl ?? "",
      xUrl: card?.xUrl ?? "",
      instagramUrl: card?.instagramUrl ?? "",
    },
  });

  const save = useAction(upsertContactCardAction.bind(null, emailAccountId), {
    onSuccess: () => {
      toastSuccess({ description: "Card saved" });
      mutate();
    },
    onError: (actionError) => {
      toastError({ description: getActionErrorMessage(actionError.error) });
    },
  });

  return (
    <form
      className="space-y-5"
      onSubmit={handleSubmit((values) =>
        save.execute({
          slug: values.slug,
          isActive,
          displayName: values.displayName,
          headline: values.headline,
          title: values.title,
          companyName: values.companyName,
          email: values.email,
          phone: values.phone,
          website: values.website,
          photoUrl: values.photoUrl,
          location: values.location,
          linkedinUrl: values.linkedinUrl,
          xUrl: values.xUrl,
          instagramUrl: values.instagramUrl,
        }),
      )}
    >
      {url && <ShareRow url={url} />}
      {stats && <StatsPanel stats={stats} />}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="card-slug">Link</Label>
          <div className="mt-2 flex items-center gap-2">
            <span className="shrink-0 text-sm text-muted-foreground">
              /card/
            </span>
            <Input id="card-slug" required {...register("slug")} />
          </div>
        </div>
        <div>
          <Label htmlFor="card-name">Name</Label>
          <Input
            id="card-name"
            required
            className="mt-2"
            {...register("displayName")}
          />
        </div>
        <div>
          <Label htmlFor="card-title">Title</Label>
          <Input id="card-title" className="mt-2" {...register("title")} />
        </div>
        <div>
          <Label htmlFor="card-company">Company</Label>
          <Input
            id="card-company"
            className="mt-2"
            {...register("companyName")}
          />
        </div>
        <div>
          <Label htmlFor="card-email">Email</Label>
          <Input
            id="card-email"
            type="email"
            className="mt-2"
            {...register("email")}
          />
        </div>
        <div>
          <Label htmlFor="card-phone">Phone</Label>
          <Input id="card-phone" className="mt-2" {...register("phone")} />
        </div>
        <div>
          <Label htmlFor="card-website">Website</Label>
          <Input
            id="card-website"
            className="mt-2"
            placeholder="https://"
            {...register("website")}
          />
        </div>
        <div>
          <Label htmlFor="card-location">Location</Label>
          <Input
            id="card-location"
            className="mt-2"
            placeholder="Norwood, MA"
            {...register("location")}
          />
        </div>
        <div>
          <Label htmlFor="card-linkedin">LinkedIn</Label>
          <Input
            id="card-linkedin"
            className="mt-2"
            placeholder="linkedin.com/in/you"
            {...register("linkedinUrl")}
          />
        </div>
        <div>
          <Label htmlFor="card-x">X / Twitter</Label>
          <Input
            id="card-x"
            className="mt-2"
            placeholder="x.com/you"
            {...register("xUrl")}
          />
        </div>
        <div>
          <Label htmlFor="card-instagram">Instagram</Label>
          <Input
            id="card-instagram"
            className="mt-2"
            placeholder="instagram.com/you"
            {...register("instagramUrl")}
          />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="card-photo">Photo URL</Label>
          <Input
            id="card-photo"
            className="mt-2"
            placeholder="https://"
            {...register("photoUrl")}
          />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="card-headline">About</Label>
          <Textarea
            id="card-headline"
            rows={3}
            className="mt-2"
            placeholder="A line or two about what you do"
            {...register("headline")}
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div>
          <Label htmlFor="card-active">Link is live</Label>
          <p className="mt-1 text-sm text-muted-foreground">
            Turn this off and the link shows a not-found page.
          </p>
        </div>
        <Switch
          id="card-active"
          checked={isActive}
          onCheckedChange={setIsActive}
        />
      </div>

      <div className="flex justify-end">
        <Button type="submit" loading={save.isExecuting}>
          Save card
        </Button>
      </div>
    </form>
  );
}

function ShareRow({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border p-3">
      <code className="min-w-0 flex-1 truncate text-sm">{url}</code>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={async () => {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
      >
        {copied ? (
          <CheckIcon className="size-3.5" />
        ) : (
          <CopyIcon className="size-3.5" />
        )}
        <span className="ml-1.5">{copied ? "Copied" : "Copy"}</span>
      </Button>
      <Button type="button" variant="outline" size="sm" asChild>
        <a href={url} target="_blank" rel="noopener noreferrer">
          <ExternalLinkIcon className="size-3.5" />
        </a>
      </Button>
    </div>
  );
}

function StatsPanel({
  stats,
}: {
  stats: NonNullable<ContactCardResponse["stats"]>;
}) {
  // Scale bars to the busiest day so a quiet month still shows shape
  const peak = Math.max(...stats.daily.map((entry) => entry.views), 1);

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex items-baseline gap-6">
        <div>
          <p className="font-display text-2xl tracking-tight">
            {stats.totalViews}
          </p>
          <p className="text-[11px] font-medium uppercase tracking-[0.15em] text-muted-foreground/70">
            Views
          </p>
        </div>
        <div>
          <p className="font-display text-2xl tracking-tight">
            {stats.uniqueVisitors}
          </p>
          <p className="text-[11px] font-medium uppercase tracking-[0.15em] text-muted-foreground/70">
            People
          </p>
        </div>
      </div>

      <div className="mt-4 flex h-16 items-end gap-0.5">
        {stats.daily.map((entry) => (
          <div
            key={entry.day}
            className="flex-1 rounded-t-sm bg-primary/70"
            style={{
              height: `${Math.max((entry.views / peak) * 100, entry.views ? 8 : 2)}%`,
            }}
            title={`${entry.day}: ${entry.views} ${entry.views === 1 ? "view" : "views"}`}
          />
        ))}
      </div>
      <p className="mt-2 text-sm text-muted-foreground">Last 30 days</p>
    </div>
  );
}
