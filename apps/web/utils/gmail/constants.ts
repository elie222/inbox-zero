export const messageVisibility = {
  show: "show",
  hide: "hide",
} as const;
export type MessageVisibility =
  (typeof messageVisibility)[keyof typeof messageVisibility];

export const labelVisibility = {
  labelShow: "labelShow",
  labelShowIfUnread: "labelShowIfUnread",
  labelHide: "labelHide",
} as const;
export type LabelVisibility =
  (typeof labelVisibility)[keyof typeof labelVisibility];
