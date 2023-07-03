// import { SCOPES } from "@/app/api/google/client";
import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";

// const authorizationUrl = new URL(
//   "https://accounts.google.com/o/oauth2/v2/auth"
// );
// authorizationUrl.searchParams.set("prompt", "consent");
// authorizationUrl.searchParams.set("access_type", "offline");
// authorizationUrl.searchParams.set("response_type", "code");

export const authOptions = {
  secret: process.env.SECRET,
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      // authorization: {
      //   url: authorizationUrl.toString(),
      //   params: { scope: SCOPES.join(" ") },
      // },
    }),
  ],
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
