// The default names we give to rules in our database. The user can edit these
export const RuleName: Record<SystemRule, string> = {
  ToReply: "To Reply",
  AwaitingReply: "Awaiting Reply",
  Fyi: "FYI",
  Actioned: "Actioned",
  Newsletter: "Newsletter",
  Marketing: "Marketing",
  Calendar: "Calendar",
  Receipt: "Receipt",
  Notification: "Notification",
  ColdEmail: "Cold Email",
};

export const SystemRule = {
  ToReply: "To Reply",
  AwaitingReply: "Awaiting Reply",
  Fyi: "FYI",
  Actioned: "Actioned",
  Newsletter: "Newsletter",
  Marketing: "Marketing",
  Calendar: "Calendar",
  Receipt: "Receipt",
  Notification: "Notification",
  ColdEmail: "Cold Email",
};
export type SystemRule = (typeof SystemRule)[keyof typeof SystemRule];
