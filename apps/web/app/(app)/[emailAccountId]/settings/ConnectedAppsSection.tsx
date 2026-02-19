"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  HashIcon,
  LockIcon,
  MessageCircleIcon,
  MessageSquareIcon,
  SendIcon,
  SlackIcon,
  XIcon,
} from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAction } from "next-safe-action/hooks";
import { useForm, type SubmitHandler } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  Item,
  ItemContent,
  ItemTitle,
  ItemActions,
  ItemSeparator,
} from "@/components/ui/item";
import { toastSuccess, toastError, toastInfo } from "@/components/Toast";
import {
  useChannelTargets,
  useMessagingChannels,
} from "@/hooks/useMessagingChannels";
import {
  connectTelegramAction,
  connectWhatsAppAction,
  disconnectChannelAction,
  linkSlackWorkspaceAction,
  updateSlackChannelAction,
} from "@/utils/actions/messaging-channels";
import {
  connectTelegramBody,
  type ConnectTelegramBody,
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
  TELEGRAM: { name: "Telegram", icon: SendIcon },
};

export function ConnectedAppsSection({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const {
    data: channelsData,
    isLoading,
    error,
    mutate: mutateChannels,
  } = useMessagingChannels();
  const [connectingSlack, setConnectingSlack] = useState(false);
  const [existingWorkspace, setExistingWorkspace] = useState<{
    teamId: string;
    teamName: string;
  } | null>(null);
  const [authUrl, setAuthUrl] = useState<string | null>(null);

  const connectedChannels =
    channelsData?.channels.filter((channel) => channel.isConnected) ?? [];
  const hasSlack = connectedChannels.some(
    (channel) => channel.provider === "SLACK",
  );
  const hasWhatsApp = connectedChannels.some(
    (channel) => channel.provider === "WHATSAPP",
  );
  const hasTelegram = connectedChannels.some(
    (channel) => channel.provider === "TELEGRAM",
  );
  const slackAvailable =
    channelsData?.availableProviders?.includes("SLACK") ?? false;
  const whatsAppAvailable =
    channelsData?.availableProviders?.includes("WHATSAPP") ?? false;
  const telegramAvailable =
    channelsData?.availableProviders?.includes("TELEGRAM") ?? false;
  const showConnectActions =
    (!hasSlack && slackAvailable) ||
    (!hasWhatsApp && whatsAppAvailable) ||
    (!hasTelegram && telegramAvailable);

  const { execute: executeLinkSlack, status: linkStatus } = useAction(
    linkSlackWorkspaceAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Slack connected" });
        setExistingWorkspace(null);
        setAuthUrl(null);
        mutateChannels();
      },
      onError: (error) => {
        const msg = getActionErrorMessage(error.error);
        if (msg?.includes("Could not find your Slack account") && authUrl) {
          toastInfo({
            title: "Email not found in Slack",
            description: "Redirecting to Slack authorization...",
          });
          window.location.href = authUrl;
        } else {
          toastError({ description: msg ?? "Failed to link Slack" });
        }
      },
    },
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

      if (data.existingWorkspace) {
        setExistingWorkspace(data.existingWorkspace);
        setAuthUrl(data.url);
        setConnectingSlack(false);
        return;
      }

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

  const handleLinkSlack = () => {
    if (!existingWorkspace) return;
    executeLinkSlack({ teamId: existingWorkspace.teamId });
  };

  return (
    <>
      <ItemSeparator />
      <Item size="sm">
        <ItemContent>
          <ItemTitle>Connected Apps</ItemTitle>
        </ItemContent>
        <ItemActions>
          {showConnectActions ? (
            <div className="flex flex-wrap items-center gap-2">
              {!hasSlack && slackAvailable ? (
                existingWorkspace ? (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={linkStatus === "executing"}
                      onClick={handleLinkSlack}
                    >
                      <SlackIcon className="mr-2 h-4 w-4" />
                      {linkStatus === "executing"
                        ? "Linking..."
                        : `Link to ${existingWorkspace.teamName}`}
                    </Button>
                    <button
                      type="button"
                      className="text-xs text-muted-foreground underline underline-offset-4"
                      onClick={() => {
                        if (authUrl) window.location.href = authUrl;
                      }}
                    >
                      Install manually
                    </button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={connectingSlack || isLoading}
                    onClick={handleConnectSlack}
                  >
                    <SlackIcon className="mr-2 h-4 w-4" />
                    {connectingSlack ? "Connecting..." : "Connect Slack"}
                  </Button>
                )
              ) : null}

              {!hasWhatsApp && whatsAppAvailable && (
                <ConnectWhatsAppDialog
                  emailAccountId={emailAccountId}
                  onDone={mutateChannels}
                />
              )}

              {!hasTelegram && telegramAvailable && (
                <ConnectTelegramDialog
                  emailAccountId={emailAccountId}
                  onDone={mutateChannels}
                />
              )}
            </div>
          ) : null}
        </ItemActions>
      </Item>
      <LoadingContent loading={isLoading} error={error} loadingComponent={null}>
        {connectedChannels.length > 0 && (
          <div className="space-y-2 px-4 pb-3">
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
    </>
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

function ConnectTelegramDialog({
  emailAccountId,
  onDone,
}: {
  emailAccountId: string;
  onDone: () => void;
}) {
  const defaultValues: ConnectTelegramBody = {
    botToken: "",
    authorizedSender: "",
    displayName: "",
  };
  const [open, setOpen] = useState(false);
  const {
    register,
    reset,
    handleSubmit,
    formState: { errors },
  } = useForm<ConnectTelegramBody>({
    resolver: zodResolver(connectTelegramBody),
    defaultValues,
  });

  const { execute: executeConnectTelegram, isExecuting } = useAction(
    connectTelegramAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Telegram connected" });
        setOpen(false);
        reset(defaultValues);
        onDone();
      },
      onError: (error) => {
        toastError({
          description:
            getActionErrorMessage(error.error) ?? "Failed to connect Telegram",
        });
      },
    },
  );

  const onSubmit: SubmitHandler<ConnectTelegramBody> = (values) => {
    executeConnectTelegram({
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
          <SendIcon className="mr-2 h-4 w-4" />
          Connect Telegram
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect Telegram</DialogTitle>
          <DialogDescription>
            Enter your Telegram bot credentials to connect this email account.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
          <div className="space-y-1">
            <Label htmlFor="botToken">Bot Token</Label>
            <Input
              id="botToken"
              type="password"
              {...register("botToken")}
              required
            />
            {errors.botToken && (
              <p className="text-destructive text-xs">
                {errors.botToken.message}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="authorizedSender">
              Authorized Sender Telegram User ID
            </Label>
            <Input
              id="authorizedSender"
              {...register("authorizedSender")}
              placeholder="123456789"
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
            {isExecuting ? "Connecting..." : "Connect Telegram"}
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
    channelId: string | null;
    channelName: string | null;
  };
  emailAccountId: string;
  onUpdate: () => void;
}) {
  const config = PROVIDER_CONFIG[channel.provider];
  const Icon = config?.icon ?? MessageSquareIcon;
  const [selectingTarget, setSelectingTarget] = useState(!channel.channelId);

  useEffect(() => {
    setSelectingTarget(!channel.channelId);
  }, [channel.channelId]);

  const selectingSlackTarget = channel.provider === "SLACK" && selectingTarget;
  const {
    data: targetsData,
    isLoading: isLoadingTargets,
    error: targetsError,
    mutate: mutateTargets,
  } = useChannelTargets(selectingSlackTarget ? channel.id : null);
  const privateTargets =
    targetsData?.targets.filter((target) => target.isPrivate) ?? [];
  const hasTargetLoadError = Boolean(targetsError || targetsData?.error);
  const selectionState = getSlackChannelSelectionState({
    channelId: channel.channelId,
    selectingTarget,
    isLoadingTargets,
    hasTargetLoadError,
  });

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

  const { execute: executeSetTarget, status: setTargetStatus } = useAction(
    updateSlackChannelAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Slack channel updated" });
        setSelectingTarget(false);
        onUpdate();
      },
      onError: (error) => {
        toastError({
          description:
            getActionErrorMessage(error.error) ?? "Failed to update channel",
        });
      },
    },
  );

  return (
    <div className="flex items-start justify-between rounded-md border bg-muted/30 px-3 py-2">
      <div className="flex items-start gap-2 text-sm">
        <Icon className="mt-0.5 h-4 w-4 text-muted-foreground" />
        <div className="space-y-1">
          <div>
            {config?.name ?? channel.provider}
            {channel.teamName && (
              <span className="text-muted-foreground">
                {" "}
                &middot; {channel.teamName}
              </span>
            )}
          </div>

          {channel.provider === "SLACK" && (
            <div className="space-y-1">
              {selectionState.showCurrentChannel ? (
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline underline-offset-4"
                  onClick={() => setSelectingTarget(true)}
                >
                  #{channel.channelName || channel.channelId}
                </button>
              ) : (
                <Select
                  onValueChange={(value) => {
                    const target = privateTargets?.find((t) => t.id === value);
                    if (!target) return;

                    executeSetTarget({
                      channelId: channel.id,
                      targetId: target.id,
                      targetName: target.name,
                    });
                  }}
                  disabled={
                    isLoadingTargets ||
                    hasTargetLoadError ||
                    setTargetStatus === "executing"
                  }
                >
                  <SelectTrigger className="h-8 w-52 text-xs">
                    <SelectValue
                      placeholder={
                        hasTargetLoadError
                          ? "Failed to load channels"
                          : isLoadingTargets
                            ? "Loading channels..."
                            : "Select private channel"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {privateTargets?.map((target) => (
                      <SelectItem key={target.id} value={target.id}>
                        <LockIcon className="mr-1 inline h-3 w-3" />
                        {target.name}
                      </SelectItem>
                    ))}
                    {!isLoadingTargets && privateTargets.length === 0 && (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">
                        No private channels found
                      </div>
                    )}
                  </SelectContent>
                </Select>
              )}

              {selectionState.showInviteHint && (
                <div className="text-xs text-muted-foreground">
                  Invite the bot with{" "}
                  <code className="rounded bg-muted px-1">
                    /invite @InboxZero
                  </code>{" "}
                  in a private channel.
                </div>
              )}

              {(selectionState.showErrorHint ||
                selectionState.showCancelSelection) && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {selectionState.showErrorHint && (
                    <>
                      <span>Unable to load Slack channels.</span>
                      <button
                        type="button"
                        className="underline underline-offset-4"
                        onClick={() => mutateTargets()}
                      >
                        Retry
                      </button>
                    </>
                  )}
                  {selectionState.showCancelSelection && (
                    <button
                      type="button"
                      className="underline underline-offset-4"
                      onClick={() => setSelectingTarget(false)}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
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

export function useSlackNotifications(enabled: boolean) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const handled = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    if (handled.current) return;

    const message = searchParams.get("message");
    const error = searchParams.get("error");
    const errorReason = searchParams.get("error_reason");
    const errorDetail = searchParams.get("error_detail");
    const resolvedReason = resolveSlackErrorReason(errorReason, errorDetail);

    if (!message && !error && !errorReason && !errorDetail) return;

    handled.current = true;

    if (message === "slack_connected") {
      toastSuccess({ description: "Slack connected" });
    }
    if (message === "processing") {
      toastInfo({
        title: "Slack connection in progress",
        description:
          "Slack is still finalizing your connection. Please refresh in a moment.",
      });
    }

    if (error === "connection_failed" || errorDetail) {
      toastError({
        title: "Slack connection failed",
        description: getSlackConnectionFailedDescription(resolvedReason),
      });
    }

    const preserved = new URLSearchParams();
    for (const [key, value] of searchParams.entries()) {
      if (
        key !== "message" &&
        key !== "error" &&
        key !== "error_reason" &&
        key !== "error_detail"
      ) {
        preserved.set(key, value);
      }
    }
    const qs = preserved.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }, [enabled, pathname, router, searchParams]);
}

function getSlackConnectionFailedDescription(
  errorReason: string | null,
): string {
  if (errorReason === "oauth_invalid_code") {
    return "Slack returned an invalid or expired code. Please try connecting again.";
  }

  if (
    errorReason === "missing_code" ||
    errorReason === "missing_state" ||
    errorReason === "invalid_state" ||
    errorReason === "invalid_state_format"
  ) {
    return "Slack session validation failed. Please try connecting again.";
  }

  return "We couldn't complete the Slack connection. Please try again.";
}

function resolveSlackErrorReason(
  errorReason: string | null,
  errorDetail: string | null,
): string | null {
  if (errorReason) return errorReason;
  if (!errorDetail) return null;

  const normalized = errorDetail.toLowerCase();

  if (normalized.includes("invalid_code")) {
    return "oauth_invalid_code";
  }
  if (normalized.includes("invalid_state_format")) {
    return "invalid_state_format";
  }
  if (normalized.includes("invalid_state")) {
    return "invalid_state";
  }
  if (normalized.includes("missing_state")) {
    return "missing_state";
  }
  if (normalized.includes("missing_code")) {
    return "missing_code";
  }

  return null;
}

export function getSlackChannelSelectionState({
  channelId,
  selectingTarget,
  isLoadingTargets,
  hasTargetLoadError,
}: {
  channelId: string | null;
  selectingTarget: boolean;
  isLoadingTargets: boolean;
  hasTargetLoadError: boolean;
}) {
  const showChannelSelector = !channelId || selectingTarget;

  return {
    showChannelSelector,
    showCurrentChannel: !showChannelSelector,
    showInviteHint:
      showChannelSelector && !isLoadingTargets && !hasTargetLoadError,
    showErrorHint: showChannelSelector && hasTargetLoadError,
    showCancelSelection: Boolean(channelId && selectingTarget),
  };
}
