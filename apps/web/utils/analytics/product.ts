export const PRODUCT_ANALYTICS_EVENTS = {
  pageViewed: "app_page_viewed",
  navigationClicked: "app_navigation_clicked",
  pageAction: "app_page_action",
} as const;

export const PRODUCT_ANALYTICS_ACTIONS = {
  chat: {
    attachButtonClicked: "chat_attach_button_clicked",
    attachmentsAdded: "chat_attachments_added",
    generationStopped: "chat_generation_stopped",
    messageSubmitted: "chat_message_submitted",
    suggestionClicked: "chat_suggestion_clicked",
  },
  navigation: {
    tabSelected: "tab_selected",
  },
  channels: {
    channelConnectStarted: "channel_connect_started",
    channelDisconnected: "channel_disconnected",
    channelLinkCodeCreated: "channel_link_code_created",
    featureRouteToggled: "feature_route_toggled",
    ruleChannelModeChanged: "rule_channel_mode_changed",
    ruleChannelToggled: "rule_channel_toggled",
  },
  calendars: {
    bookingLinkSaved: "calendar_booking_link_saved",
    bookingLinkSaveStarted: "calendar_booking_link_save_started",
    connectFailed: "calendar_connect_failed",
    connectStarted: "calendar_connect_started",
    connectStartFailed: "calendar_connect_start_failed",
    timezoneSaved: "calendar_timezone_saved",
    timezoneSaveStarted: "calendar_timezone_save_started",
  },
  meetingBriefs: {
    emailDeliverySaved: "meeting_briefs_email_delivery_saved",
    emailDeliveryToggled: "meeting_briefs_email_delivery_toggled",
    enabledSaved: "meeting_briefs_enabled_saved",
    enableStarted: "meeting_briefs_enable_started",
    toggled: "meeting_briefs_toggled",
  },
  bulkUnsubscribe: {
    bulkCompleted: "bulk_unsubscribe_completed",
    bulkStarted: "bulk_unsubscribe_started",
    senderCompleted: "unsubscribe_sender_completed",
    senderFailed: "unsubscribe_sender_failed",
    senderStarted: "unsubscribe_sender_started",
  },
  bulkArchive: {
    actionChanged: "bulk_archive_action_changed",
    categorizationCompleted: "bulk_archive_categorization_completed",
    setupDialogToggled: "bulk_archive_setup_dialog_toggled",
  },
  autoFile: {
    enabled: "auto_file_enabled",
    enableFailed: "auto_file_enable_failed",
    enableStarted: "auto_file_enable_started",
    folderRemoved: "auto_file_folder_removed",
    folderSelected: "auto_file_folder_selected",
    previewFailed: "auto_file_preview_failed",
    previewFeedbackSubmitted: "auto_file_preview_feedback_submitted",
    previewItemFailed: "auto_file_preview_item_failed",
    previewItemFiled: "auto_file_preview_item_filed",
    previewItemMoved: "auto_file_preview_item_moved",
    previewItemSkipped: "auto_file_preview_item_skipped",
    previewCompleted: "auto_file_preview_completed",
    previewStarted: "auto_file_preview_started",
    promptSaveFailed: "auto_file_prompt_save_failed",
    promptSaved: "auto_file_prompt_saved",
  },
  integrations: {
    connectFailed: "integration_connect_failed",
    connectStarted: "integration_connect_started",
    disconnected: "integration_disconnected",
    disconnectStarted: "integration_disconnect_started",
    toggled: "integration_toggled",
    toolsToggled: "integration_tools_toggled",
    toolToggled: "integration_tool_toggled",
  },
  analytics: {
    dateRangeChanged: "analytics_date_range_changed",
    groupingChanged: "analytics_grouping_changed",
  },
  deepClean: {
    started: "deep_clean_started",
  },
} as const;

export const APP_PAGES = {
  mail: { label: "Mail", area: "mail" },
  assistant_chat: { label: "Chat", area: "manage" },
  automation: { label: "Assistant", area: "manage" },
  channels: { label: "Channels", area: "manage" },
  bulk_unsubscribe: { label: "Bulk Unsubscribe", area: "cleanup" },
  bulk_archive: { label: "Bulk Archive", area: "cleanup" },
  analytics: { label: "Analytics", area: "cleanup" },
  deep_clean: { label: "Deep Clean", area: "cleanup" },
  meeting_briefs: { label: "Meeting Briefs", area: "more" },
  attachments: { label: "Attachments", area: "more" },
  calendars: { label: "Calendars", area: "more" },
  integrations: { label: "Integrations", area: "more" },
} as const;

export type AppPage = keyof typeof APP_PAGES;
export type ProductAnalyticsAction = StringLeaf<
  typeof PRODUCT_ANALYTICS_ACTIONS
>;

const APP_ROUTE_SEGMENTS: Array<{ segment: string; page: AppPage }> = [
  { segment: "mail", page: "mail" },
  { segment: "compose", page: "mail" },
  { segment: "assistant", page: "assistant_chat" },
  { segment: "automation", page: "automation" },
  { segment: "channels", page: "channels" },
  { segment: "bulk-unsubscribe", page: "bulk_unsubscribe" },
  { segment: "bulk-archive", page: "bulk_archive" },
  { segment: "quick-bulk-archive", page: "bulk_archive" },
  { segment: "stats", page: "analytics" },
  { segment: "clean", page: "deep_clean" },
  { segment: "briefs", page: "meeting_briefs" },
  { segment: "drive", page: "attachments" },
  { segment: "calendars", page: "calendars" },
  { segment: "integrations", page: "integrations" },
];

const NAV_ITEM_PAGES: Record<string, AppPage> = {
  Inbox: "mail",
  Drafts: "mail",
  Sent: "mail",
  Archived: "mail",
  Personal: "mail",
  Social: "mail",
  Updates: "mail",
  Forums: "mail",
  Promotions: "mail",
  Chat: "assistant_chat",
  Assistant: "automation",
  Channels: "channels",
  "Bulk Unsubscribe": "bulk_unsubscribe",
  "Bulk Archive": "bulk_archive",
  Analytics: "analytics",
  "Deep Clean": "deep_clean",
  "Meeting Briefs": "meeting_briefs",
  Attachments: "attachments",
  Calendars: "calendars",
  Integrations: "integrations",
};

export function getAppPageFromPathname(
  pathname: string | null | undefined,
): AppPage | null {
  if (!pathname) return null;

  const segments = pathname.split("/").filter(Boolean);
  const route = APP_ROUTE_SEGMENTS.find(({ segment }) =>
    segments.includes(segment),
  );

  return route?.page ?? null;
}

export function getAppPageFromNavItem({
  name,
  href,
}: {
  name: string;
  href: string;
}): AppPage | null {
  if (NAV_ITEM_PAGES[name]) return NAV_ITEM_PAGES[name];

  const hrefPath = href.startsWith("?") ? null : href.split("?")[0];
  return getAppPageFromPathname(hrefPath);
}

export function getAppPageProperties(page: AppPage | null) {
  if (!page) return {};

  const config = APP_PAGES[page];
  return {
    app_page: page,
    app_page_label: config.label,
    app_area: config.area,
  };
}

export function getAppPageViewProperties({
  pathname,
  searchParams,
}: {
  pathname: string | null | undefined;
  searchParams?: Pick<URLSearchParams, "get"> | null;
}) {
  const page = getAppPageFromPathname(pathname);
  if (!page) return null;

  const tab = searchParams?.get("tab") || undefined;
  const mailType = searchParams?.get("type") || undefined;

  return {
    ...getAppPageProperties(page),
    route: pathname,
    ...(tab ? { tab } : {}),
    ...(mailType ? { mail_type: mailType } : {}),
  };
}

type StringLeaf<T> = T extends string
  ? T
  : T extends Record<string, unknown>
    ? StringLeaf<T[keyof T]>
    : never;
