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

export const GOOGLE_LINKING_STATE_COOKIE_NAME = "google_linking_state";
export const GOOGLE_LINKING_STATE_RESULT_COOKIE_NAME =
  "google_linking_state_result";
