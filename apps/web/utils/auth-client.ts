import { createAuthClient } from "better-auth/react";
import { env } from "@/env";

export const { signIn, signOut, signUp, useSession, getSession } =
  createAuthClient({ baseURL: env.NEXT_PUBLIC_BASE_URL });
