"use client";

import { useEffect } from "react";
import { logOut } from "@/utils/user";

export default function AutoLogOut(props: { loggedIn: boolean }) {
  useEffect(() => {
    // this may fix the sign in error
    // have been seeing this error when a user is not properly logged out and an attempt is made to link accounts instead of logging in.
    // More here: https://github.com/nextauthjs/next-auth/issues/3300
    if (props.loggedIn) {
      console.log("Logging user out");
      logOut();
    }
  }, [props.loggedIn]);

  return null;
}
