"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  HashIcon,
  MessageCircleIcon,
  MessageSquareIcon,
  SlackIcon,
  XIcon,
} from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAction } from "next-safe-action/hooks";
import { useForm, type SubmitHandler } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { LoadingContent } from "@/components/LoadingContent";
import { SettingsSection } from "@/components/SettingsSection";
import { toastSuccess, toastError } from "@/components/Toast";
import { useMessagingChannels } from "@/hooks/useMessagingChannels";
import {
  connectWhatsAppAction,
  disconnectChannelAction,
} from "@/utils/actions/messaging-channels";
import {
  connectWhatsAppBody,
  type ConnectWhatsAppBody,
} from "@/utils/actions/messaging-channels.validation";
import { fetchWithAccount } from "@/utils/fetch";
import { captureException } from "@/utils/error";
import { getActionErrorMessage } from "@/utils/error";
import type { GetSlackAuthUrlResponse } from "@/app/api/slack/auth-url/route";
import type { MessagingProvider } from "@/generated/prisma/enums";

const PROVIDER_CONFIG: Record<
  MessagingProvider,
  { name: string; icon: typeof MessageSquareIcon }
> = {
  SLACK: { name: "Slack", icon: HashIcon },
  WHATSAPP: { name: "WhatsApp", icon: MessageCircleIcon },
};

export function ConnectedAppsSection({
  emailAccountId,
  showNotifications = true,
}: {
  emailAccountId: string;
  showNotifications?: boolean;
}) {
  useSlackNotifications(showNotifications);

  const {
    data: channelsData,
    isLoading,
    error,
    mutate: mutateChannels,
  } = useMessagingChannels(emailAccountId);
  const [connectingSlack, setConnectingSlack] = useState(false);

  const connectedChannels =
    channelsData?.channels.filter((channel) => channel.isConnected) ?? [];
  const hasSlack = connectedChannels.some(
    (channel) => channel.provider === "SLACK",
  );
  const hasWhatsApp = connectedChannels.some(
    (channel) => channel.provider === "WHATSAPP",
  );

  const handleConnectSlack = async () => {
    setConnectingSlack(true);
    try {
      const res = await fetchWithAccount({
        url: "/api/slack/auth-url",
        emailAccountId,
      });
      if (!res.ok) {
        throw new Error("Failed to get Slack auth URL");
      }
      const data: GetSlackAuthUrlResponse = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error("No auth URL returned");
      }
    } catch (error) {
      captureException(error, {
        extra: { context: "Slack OAuth initiation" },
      });
      toastError({ description: "Failed to connect Slack" });
      setConnectingSlack(false);
    }
  };

  return (
    <SettingsSection
      title="Connected Apps"
      description=""
      titleClassName="text-sm"
      descriptionClassName="text-xs sm:text-sm"
      actions={
        !hasSlack || !hasWhatsApp ? (
          <div className="flex flex-wrap gap-2">
            {!hasSlack && (
              <Button
                variant="outline"
                size="sm"
                disabled={connectingSlack || isLoading}
                onClick={handleConnectSlack}
              >
                <SlackIcon className="mr-2 h-4 w-4" />
                {connectingSlack ? "Connecting..." : "Connect Slack"}
              </Button>
            )}

            {!hasWhatsApp && (
              <ConnectWhatsAppDialog
                emailAccountId={emailAccountId}
                onDone={mutateChannels}
              />
            )}
          </div>
        ) : null
      }
    >
      <LoadingContent loading={isLoading} error={error}>
        {connectedChannels.length > 0 && (
          <div className="space-y-2">
            {connectedChannels.map((channel) => (
              <ConnectedChannelRow
                key={channel.id}
                channel={channel}
                emailAccountId={emailAccountId}
                onUpdate={mutateChannels}
              />
            ))}
          </div>
        )}
      </LoadingContent>
    </SettingsSection>
  );
}

function ConnectWhatsAppDialog({
  emailAccountId,
  onDone,
}: {
  emailAccountId: string;
  onDone: () => void;
}) {
  const defaultValues: ConnectWhatsAppBody = {
    wabaId: "",
    phoneNumberId: "",
    accessToken: "",
    authorizedSender: "",
    displayName: "",
  };
  const [open, setOpen] = useState(false);
  const {
    register,
    reset,
    handleSubmit,
    formState: { errors },
  } = useForm<ConnectWhatsAppBody>({
    resolver: zodResolver(connectWhatsAppBody),
    defaultValues,
  });

  const { execute: executeConnectWhatsApp, isExecuting } = useAction(
    connectWhatsAppAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "WhatsApp connected" });
        setOpen(false);
        reset(defaultValues);
        onDone();
      },
      onError: (error) => {
        toastError({
          description:
            getActionErrorMessage(error.error) ?? "Failed to connect WhatsApp",
        });
      },
    },
  );

  const onSubmit: SubmitHandler<ConnectWhatsAppBody> = (values) => {
    executeConnectWhatsApp({
      ...values,
      displayName: values.displayName?.trim() || undefined,
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) return;
        reset(defaultValues);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <MessageCircleIcon className="mr-2 h-4 w-4" />
          Connect WhatsApp
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect WhatsApp</DialogTitle>
          <DialogDescription>
            Enter your WhatsApp Business details to connect this email account.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
          <div className="space-y-1">
            <Label htmlFor="wabaId">WhatsApp Business Account ID</Label>
            <Input id="wabaId" {...register("wabaId")} required />
            {errors.wabaId && (
              <p className="text-destructive text-xs">
                {errors.wabaId.message}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="phoneNumberId">Phone Number ID</Label>
            <Input id="phoneNumberId" {...register("phoneNumberId")} required />
            {errors.phoneNumberId && (
              <p className="text-destructive text-xs">
                {errors.phoneNumberId.message}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="accessToken">Access Token</Label>
            <Input
              id="accessToken"
              type="password"
              {...register("accessToken")}
              required
            />
            {errors.accessToken && (
              <p className="text-destructive text-xs">
                {errors.accessToken.message}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="authorizedSender">
              Authorized Sender WhatsApp Number
            </Label>
            <Input
              id="authorizedSender"
              {...register("authorizedSender")}
              placeholder="+15551230000"
              required
            />
            {errors.authorizedSender && (
              <p className="text-destructive text-xs">
                {errors.authorizedSender.message}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="displayName">Display Name (optional)</Label>
            <Input id="displayName" {...register("displayName")} />
            {errors.displayName && (
              <p className="text-destructive text-xs">
                {errors.displayName.message}
              </p>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={isExecuting}>
            {isExecuting ? "Connecting..." : "Connect WhatsApp"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ConnectedChannelRow({
  channel,
  emailAccountId,
  onUpdate,
}: {
  channel: {
    id: string;
    provider: MessagingProvider;
    teamName: string | null;
  };
  emailAccountId: string;
  onUpdate: () => void;
}) {
  const config = PROVIDER_CONFIG[channel.provider];
  const Icon = config?.icon ?? MessageSquareIcon;

  const { execute: executeDisconnect, status: disconnectStatus } = useAction(
    disconnectChannelAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        const providerName = config?.name ?? channel.provider;
        toastSuccess({ description: `${providerName} disconnected` });
        onUpdate();
      },
      onError: (error) => {
        toastError({
          description:
            getActionErrorMessage(error.error) ?? "Failed to disconnect",
        });
      },
    },
  );

  return (
    <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2">
      <div className="flex items-center gap-2 text-sm">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span>
          {config?.name ?? channel.provider}
          {channel.teamName && (
            <span className="text-muted-foreground">
              {" "}
              &middot; {channel.teamName}
            </span>
          )}
        </span>
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        disabled={disconnectStatus === "executing"}
        onClick={() => executeDisconnect({ channelId: channel.id })}
      >
        <XIcon className="h-4 w-4" />
      </Button>
    </div>
  );
}

function useSlackNotifications(enabled: boolean) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const handled = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    if (handled.current) return;

    const message = searchParams.get("message");
    const error = searchParams.get("error");

    if (!message && !error) return;

    handled.current = true;

    if (message === "slack_connected") {
      toastSuccess({ description: "Slack connected" });
    }

    if (error === "connection_failed") {
      toastError({
        title: "Slack connection failed",
        description:
          "We couldn't complete the Slack connection. Please try again.",
      });
    }

    const preserved = new URLSearchParams();
    for (const [key, value] of searchParams.entries()) {
      if (key !== "message" && key !== "error") {
        preserved.set(key, value);
      }
    }
    const qs = preserved.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }, [enabled, pathname, router, searchParams]);
}
