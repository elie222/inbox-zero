// based on: https://github.com/vercel/platforms/blob/main/lib/auth.ts
import { getServerSession, type NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
// import { PrismaAdapter } from "@next-auth/prisma-adapter";
// import prisma from "@/lib/prisma";

const VERCEL_DEPLOYMENT = !!process.env.VERCEL_URL;

const SCOPES = [
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email',

  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify",
];


const authorizationUrl = new URL(
  "https://accounts.google.com/o/oauth2/v2/auth"
);
authorizationUrl.searchParams.set("prompt", "consent");
authorizationUrl.searchParams.set("access_type", "offline");
authorizationUrl.searchParams.set("response_type", "code");

export const authOptions: NextAuthOptions = {
  secret: process.env.SECRET,
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
      authorization: {
        url: authorizationUrl.toString(),
        params: { scope: SCOPES.join(" ") },
      },
    }),
  ],
  // pages: {
  //   signIn: `/login`,
  //   verifyRequest: `/login`,
  //   error: "/login", // Error code passed in query string as ?error=
  // },
  // adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  cookies: {
    sessionToken: {
      name: `${VERCEL_DEPLOYMENT ? "__Secure-" : ""}next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        // When working on localhost, the cookie domain must be omitted entirely (https://stackoverflow.com/a/1188145)
        domain: VERCEL_DEPLOYMENT
          ? `.${process.env.NEXT_PUBLIC_ROOT_DOMAIN}`
          : undefined,
        secure: VERCEL_DEPLOYMENT,
      },
    },
  },
  callbacks: {
    jwt: async ({ token, user, account }) => {
      if (user) {
        token.user = user;
      }
      // based on: https://github.com/nextauthjs/next-auth/issues/1162#issuecomment-766331341
      if (account) {
        token.accessToken = account?.access_token;
        token.refreshToken = account?.refresh_token;
      }
      return token;
    },
    session: async ({ session, token }) => {
      session.user = {
        ...session.user,
        // @ts-expect-error
        id: token.sub,
        // @ts-expect-error
        username: token?.user?.username || token?.user?.gh_username,
      };

      // based on: https://github.com/nextauthjs/next-auth/issues/1162#issuecomment-766331341
      // @ts-expect-error
      session.accessToken = token?.accessToken;
      // @ts-expect-error
      session.refreshToken = token?.refreshToken;

      return session;
    },
  },
};

export function getSession() {
  return getServerSession(authOptions) as Promise<{
    user: {
      id: string;
      name: string;
      username: string;
      email: string;
      image: string;
    };
    accessToken: string;
    refreshToken: string;
  } | null>;
}

// export function withSiteAuth(action: any) {
//   return async (
//     formData: FormData | null,
//     siteId: string,
//     key: string | null,
//   ) => {
//     const session = await getSession();
//     if (!session) {
//       return {
//         error: "Not authenticated",
//       };
//     }
//     const site = await prisma.site.findUnique({
//       where: {
//         id: siteId,
//       },
//     });
//     if (!site || site.userId !== session.user.id) {
//       return {
//         error: "Not authorized",
//       };
//     }

//     return action(formData, site, key);
//   };
// }

// export function withPostAuth(action: any) {
//   return async (
//     formData: FormData | null,
//     postId: string,
//     key: string | null,
//   ) => {
//     const session = await getSession();
//     if (!session?.user.id) {
//       return {
//         error: "Not authenticated",
//       };
//     }
//     const post = await prisma.post.findUnique({
//       where: {
//         id: postId,
//       },
//       include: {
//         site: true,
//       },
//     });
//     if (!post || post.userId !== session.user.id) {
//       return {
//         error: "Post not found",
//       };
//     }

//     return action(formData, post, key);
//   };
// }