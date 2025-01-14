"use client";

import { signOut } from "next-auth/react";

export async function logOut(callbackUrl?: string) {
  return signOut({ callbackUrl });
}
