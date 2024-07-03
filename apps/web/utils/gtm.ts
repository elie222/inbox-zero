import { sendGTMEvent } from "@next/third-parties/google";
import { env } from "@/env";

export const signUpEvent = () => {
  if (env.NEXT_PUBLIC_GTM_ID) sendGTMEvent({ event: "CompleteRegistration" });
};

export const beginCheckoutEvent = (value: number) => {
  if (env.NEXT_PUBLIC_GTM_ID) sendGTMEvent({ event: "Begin checkout", value });
};
