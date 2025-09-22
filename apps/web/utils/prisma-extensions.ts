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
      calendarConnection: {
        accessToken: {
          needs: { accessToken: true },
          compute(connection) {
            return decryptToken(connection.accessToken);
          },
        },
        refreshToken: {
          needs: { refreshToken: true },
          compute(connection) {
            return decryptToken(connection.refreshToken);
          },
        },
      },
      mcpConnection: {
        accessToken: {
          needs: { accessToken: true },
          compute(connection) {
            return decryptToken(connection.accessToken);
          },
        },
        refreshToken: {
          needs: { refreshToken: true },
          compute(connection) {
            return decryptToken(connection.refreshToken);
          },
        },
        apiKey: {
          needs: { apiKey: true },
          compute(connection) {
            return decryptToken(connection.apiKey);
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
      calendarConnection: {
        async create({ args, query }) {
          if (args.data.accessToken) {
            args.data.accessToken = encryptToken(args.data.accessToken);
          }
          if (args.data.refreshToken) {
            args.data.refreshToken = encryptToken(args.data.refreshToken);
          }
          return query(args);
        },
        async update({ args, query }) {
          if (args.data.accessToken) {
            if (typeof args.data.accessToken === "string") {
              args.data.accessToken = encryptToken(args.data.accessToken);
            } else if (args.data.accessToken.set) {
              args.data.accessToken.set = encryptToken(
                args.data.accessToken.set,
              );
            }
          }
          if (args.data.refreshToken) {
            if (typeof args.data.refreshToken === "string") {
              args.data.refreshToken = encryptToken(args.data.refreshToken);
            } else if (args.data.refreshToken.set) {
              args.data.refreshToken.set = encryptToken(
                args.data.refreshToken.set,
              );
            }
          }
          return query(args);
        },
        async updateMany({ args, query }) {
          if (args.data.accessToken) {
            if (typeof args.data.accessToken === "string") {
              args.data.accessToken = encryptToken(args.data.accessToken);
            } else if (args.data.accessToken.set) {
              args.data.accessToken.set = encryptToken(
                args.data.accessToken.set,
              );
            }
          }
          if (args.data.refreshToken) {
            if (typeof args.data.refreshToken === "string") {
              args.data.refreshToken = encryptToken(args.data.refreshToken);
            } else if (args.data.refreshToken.set) {
              args.data.refreshToken.set = encryptToken(
                args.data.refreshToken.set,
              );
            }
          }
          return query(args);
        },
        async upsert({ args, query }) {
          if (args.create.accessToken) {
            args.create.accessToken = encryptToken(args.create.accessToken);
          }
          if (args.create.refreshToken) {
            args.create.refreshToken = encryptToken(args.create.refreshToken);
          }
          if (args.update.accessToken) {
            if (typeof args.update.accessToken === "string") {
              args.update.accessToken = encryptToken(args.update.accessToken);
            } else if (args.update.accessToken.set) {
              args.update.accessToken.set = encryptToken(
                args.update.accessToken.set,
              );
            }
          }
          if (args.update.refreshToken) {
            if (typeof args.update.refreshToken === "string") {
              args.update.refreshToken = encryptToken(args.update.refreshToken);
            } else if (args.update.refreshToken.set) {
              args.update.refreshToken.set = encryptToken(
                args.update.refreshToken.set,
              );
            }
          }
          return query(args);
        },
      },
      mcpConnection: {
        async create({ args, query }) {
          if (args.data.accessToken) {
            args.data.accessToken = encryptToken(args.data.accessToken);
          }
          if (args.data.refreshToken) {
            args.data.refreshToken = encryptToken(args.data.refreshToken);
          }
          if (args.data.apiKey) {
            args.data.apiKey = encryptToken(args.data.apiKey);
          }
          return query(args);
        },
        async update({ args, query }) {
          if (args.data.accessToken) {
            if (typeof args.data.accessToken === "string") {
              args.data.accessToken = encryptToken(args.data.accessToken);
            } else if (args.data.accessToken.set) {
              args.data.accessToken.set = encryptToken(
                args.data.accessToken.set,
              );
            }
          }
          if (args.data.refreshToken) {
            if (typeof args.data.refreshToken === "string") {
              args.data.refreshToken = encryptToken(args.data.refreshToken);
            } else if (args.data.refreshToken.set) {
              args.data.refreshToken.set = encryptToken(
                args.data.refreshToken.set,
              );
            }
          }
          if (args.data.apiKey) {
            if (typeof args.data.apiKey === "string") {
              args.data.apiKey = encryptToken(args.data.apiKey);
            } else if (args.data.apiKey.set) {
              args.data.apiKey.set = encryptToken(args.data.apiKey.set);
            }
          }
          return query(args);
        },
        async updateMany({ args, query }) {
          if (args.data.accessToken) {
            if (typeof args.data.accessToken === "string") {
              args.data.accessToken = encryptToken(args.data.accessToken);
            } else if (args.data.accessToken.set) {
              args.data.accessToken.set = encryptToken(
                args.data.accessToken.set,
              );
            }
          }
          if (args.data.refreshToken) {
            if (typeof args.data.refreshToken === "string") {
              args.data.refreshToken = encryptToken(args.data.refreshToken);
            } else if (args.data.refreshToken.set) {
              args.data.refreshToken.set = encryptToken(
                args.data.refreshToken.set,
              );
            }
          }
          if (args.data.apiKey) {
            if (typeof args.data.apiKey === "string") {
              args.data.apiKey = encryptToken(args.data.apiKey);
            } else if (args.data.apiKey.set) {
              args.data.apiKey.set = encryptToken(args.data.apiKey.set);
            }
          }
          return query(args);
        },
        async upsert({ args, query }) {
          if (args.create.accessToken) {
            args.create.accessToken = encryptToken(args.create.accessToken);
          }
          if (args.create.refreshToken) {
            args.create.refreshToken = encryptToken(args.create.refreshToken);
          }
          if (args.create.apiKey) {
            args.create.apiKey = encryptToken(args.create.apiKey);
          }
          if (args.update.accessToken) {
            if (typeof args.update.accessToken === "string") {
              args.update.accessToken = encryptToken(args.update.accessToken);
            } else if (args.update.accessToken.set) {
              args.update.accessToken.set = encryptToken(
                args.update.accessToken.set,
              );
            }
          }
          if (args.update.refreshToken) {
            if (typeof args.update.refreshToken === "string") {
              args.update.refreshToken = encryptToken(args.update.refreshToken);
            } else if (args.update.refreshToken.set) {
              args.update.refreshToken.set = encryptToken(
                args.update.refreshToken.set,
              );
            }
          }
          if (args.update.apiKey) {
            if (typeof args.update.apiKey === "string") {
              args.update.apiKey = encryptToken(args.update.apiKey);
            } else if (args.update.apiKey.set) {
              args.update.apiKey.set = encryptToken(args.update.apiKey.set);
            }
          }
          return query(args);
        },
      },
    },
  });
});
