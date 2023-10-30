import NextAuth from "next-auth";
import { authOptions } from "@/utils/auth";

export const {
  handlers: { GET, POST },
  auth,
} = NextAuth(authOptions);
