export { GET, POST } from "./auth";
// export const runtime = "edge" // optional

// This code was used in the past to reask for consent when signing in with Google.
// This doesn't happen often, but I'm keeping it here for now just in case we decide to put it back.
// This code worked with Next Auth v4. We've since moved to v5.

// import NextAuth from "next-auth";
// import { authOptions, getAuthOptions } from "@/utils/auth";

// export const dynamic = "force-dynamic";

// // https://next-auth.js.org/configuration/initialization#advanced-initialization
// async function handler(
//   request: Request,
//   context: { params?: { nextauth?: string[] } }
// ) {
//   let authOpts = authOptions;

//   if (
//     request.method === "POST" &&
//     context.params?.nextauth?.[0] === "signin" &&
//     context.params.nextauth[1] === "google"
//   ) {
//     const clonedRequest = request.clone();
//     const formData = await clonedRequest.formData();
//     const requestConsent = formData.get("consent") === "true";

//     authOpts = getAuthOptions({ consent: requestConsent });
//   }

//   // can remove `as any` once this is fixed: https://github.com/nextauthjs/next-auth/issues/8120
//   return await NextAuth(request as any, context as any, authOpts);
// }

// export { handler as GET, handler as POST };
