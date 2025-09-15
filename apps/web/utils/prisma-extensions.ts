import { Prisma } from "@prisma/client";
import { encryptToken, decryptToken } from "@/utils/encryption";

export const encryptedTokens = Prisma.defineExtension((client) => {
  return client.$extends({
    result: {
      account: {
        access_token: {
          needs: { access_token: true },
          compute(account) {
            return decryptToken(account.access_token);
          },
        },
        refresh_token: {
          needs: { refresh_token: true },
          compute(account) {
            return decryptToken(account.refresh_token);
          },
        },
      },
    },
    query: {
      account: {
        async create({ args, query }) {
          if (args.data.access_token) {
            args.data.access_token = encryptToken(args.data.access_token);
          }
          if (args.data.refresh_token) {
            args.data.refresh_token = encryptToken(args.data.refresh_token);
          }
          return query(args);
        },
        async update({ args, query }) {
          if (args.data.access_token) {
            if (typeof args.data.access_token === "string") {
              args.data.access_token = encryptToken(args.data.access_token);
            } else if (args.data.access_token.set) {
              args.data.access_token.set = encryptToken(
                args.data.access_token.set,
              );
            }
          }
          if (args.data.refresh_token) {
            if (typeof args.data.refresh_token === "string") {
              args.data.refresh_token = encryptToken(args.data.refresh_token);
            } else if (args.data.refresh_token.set) {
              args.data.refresh_token.set = encryptToken(
                args.data.refresh_token.set,
              );
            }
          }
          return query(args);
        },
        async updateMany({ args, query }) {
          if (args.data.access_token) {
            if (typeof args.data.access_token === "string") {
              args.data.access_token = encryptToken(args.data.access_token);
            } else if (args.data.access_token.set) {
              args.data.access_token.set = encryptToken(
                args.data.access_token.set,
              );
            }
          }
          if (args.data.refresh_token) {
            if (typeof args.data.refresh_token === "string") {
              args.data.refresh_token = encryptToken(args.data.refresh_token);
            } else if (args.data.refresh_token.set) {
              args.data.refresh_token.set = encryptToken(
                args.data.refresh_token.set,
              );
            }
          }
          return query(args);
        },
        async upsert({ args, query }) {
          if (args.create.access_token) {
            args.create.access_token = encryptToken(args.create.access_token);
          }
          if (args.create.refresh_token) {
            args.create.refresh_token = encryptToken(args.create.refresh_token);
          }
          if (args.update.access_token) {
            if (typeof args.update.access_token === "string") {
              args.update.access_token = encryptToken(args.update.access_token);
            } else if (args.update.access_token.set) {
              args.update.access_token.set = encryptToken(
                args.update.access_token.set,
              );
            }
          }
          if (args.update.refresh_token) {
            if (typeof args.update.refresh_token === "string") {
              args.update.refresh_token = encryptToken(
                args.update.refresh_token,
              );
            } else if (args.update.refresh_token.set) {
              args.update.refresh_token.set = encryptToken(
                args.update.refresh_token.set,
              );
            }
          }
          return query(args);
        },
      },
    },
  });
});
