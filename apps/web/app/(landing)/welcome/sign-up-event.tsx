"use client";

import { useEffect } from "react";
import { signUpEvent } from "@/utils/gtm";

export const SignUpEvent = () => {
  useEffect(() => {
    signUpEvent();
  }, []);

  return null;
};
