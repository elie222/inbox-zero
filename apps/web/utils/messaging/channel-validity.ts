import { MessagingProvider } from "@/generated/prisma/enums";

type MessagingChannelConnectionLike = {
  provider: MessagingProvider;
  isConnected?: boolean;
  accessToken?: string | null;
  providerUserId?: string | null;
};

type MessagingChannelWithRequiredFields =
  | (MessagingChannelConnectionLike & {
      provider: "SLACK";
      accessToken: string;
      providerUserId: string;
    })
  | (MessagingChannelConnectionLike & {
      provider: "TEAMS";
      providerUserId: string;
    })
  | (MessagingChannelConnectionLike & {
      provider: "TELEGRAM";
    });

type OperationalMessagingChannel = MessagingChannelWithRequiredFields & {
  isConnected: true;
};

export function hasRequiredMessagingConnectionFields(
  channel: MessagingChannelConnectionLike,
): channel is MessagingChannelWithRequiredFields {
  switch (channel.provider) {
    case MessagingProvider.SLACK:
      return Boolean(channel.accessToken && channel.providerUserId);
    case MessagingProvider.TEAMS:
      return Boolean(channel.providerUserId);
    case MessagingProvider.TELEGRAM:
      return true;
    default:
      return true;
  }
}

export function isMessagingChannelOperational(
  channel: MessagingChannelConnectionLike,
): channel is OperationalMessagingChannel {
  return (
    Boolean(channel.isConnected) &&
    hasRequiredMessagingConnectionFields(channel)
  );
}

export function isOperationalSlackChannel(
  channel: MessagingChannelConnectionLike,
): channel is Extract<OperationalMessagingChannel, { provider: "SLACK" }> {
  return (
    channel.provider === MessagingProvider.SLACK &&
    isMessagingChannelOperational(channel)
  );
}

export function isOperationalTeamsChannel(
  channel: MessagingChannelConnectionLike,
): channel is Extract<OperationalMessagingChannel, { provider: "TEAMS" }> {
  return (
    channel.provider === MessagingProvider.TEAMS &&
    isMessagingChannelOperational(channel)
  );
}

export function getMessagingChannelReconnectMessage(
  provider: MessagingProvider,
) {
  if (provider === MessagingProvider.SLACK) {
    return "Please reconnect Slack before configuring notifications.";
  }

  if (provider === MessagingProvider.TEAMS) {
    return "Please reconnect Teams before configuring notifications.";
  }

  return "Please reconnect the messaging provider before configuring notifications.";
}
