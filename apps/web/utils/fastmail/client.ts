import type { Logger } from "@/utils/logger";
import { SafeError } from "@/utils/error";
import type {
  JMAPSession,
  JMAPMethodCall,
  JMAPResponse,
} from "@/utils/fastmail/types";

const JMAP_SESSION_URL = "https://api.fastmail.com/.well-known/jmap";

export class FastmailClient {
  private readonly accessToken: string;
  private readonly logger: Logger;
  private session: JMAPSession | null = null;
  private accountId: string | null = null;

  constructor(accessToken: string, logger: Logger) {
    if (!accessToken) throw new SafeError("No access token provided");
    this.accessToken = accessToken;
    this.logger = logger;
  }

  async getSession(): Promise<JMAPSession> {
    if (this.session) {
      return this.session;
    }

    try {
      const response = await fetch(JMAP_SESSION_URL, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error("Failed to fetch JMAP session", {
          status: response.status,
          error: errorText,
        });
        throw new SafeError("Failed to authenticate with Fastmail");
      }

      this.session = await response.json();
      return this.session;
    } catch (error) {
      this.logger.error("Error fetching JMAP session", { error });
      throw error;
    }
  }

  async getAccountId(): Promise<string> {
    if (this.accountId) {
      return this.accountId;
    }

    const session = await this.getSession();
    const mailAccountId = session.primaryAccounts["urn:ietf:params:jmap:mail"];

    if (!mailAccountId) {
      throw new SafeError("No mail account found in JMAP session");
    }

    this.accountId = mailAccountId;
    return this.accountId;
  }

  async makeRequest(methodCalls: JMAPMethodCall[]): Promise<JMAPResponse> {
    const session = await this.getSession();

    try {
      const response = await fetch(session.apiUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          using: [
            "urn:ietf:params:jmap:core",
            "urn:ietf:params:jmap:mail",
            "urn:ietf:params:jmap:submission",
          ],
          methodCalls: methodCalls.map((call) => [
            call.methodName,
            call.args,
            call.id,
          ]),
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error("JMAP request failed", {
          status: response.status,
          error: errorText,
        });

        if (response.status === 401) {
          throw new SafeError(
            "Authentication failed. Please reconnect your Fastmail account.",
          );
        }

        throw new SafeError("Failed to communicate with Fastmail");
      }

      return await response.json();
    } catch (error) {
      this.logger.error("Error making JMAP request", { error });
      throw error;
    }
  }

  getAccessToken(): string {
    return this.accessToken;
  }
}

export const createFastmailClient = (
  accessToken: string,
  logger: Logger,
): FastmailClient => {
  return new FastmailClient(accessToken, logger);
};

export const getFastmailClientWithRefresh = async ({
  accessToken,
  emailAccountId,
  logger,
}: {
  accessToken?: string | null;
  refreshToken?: string | null;
  expiresAt?: number | null;
  emailAccountId: string;
  logger: Logger;
}): Promise<FastmailClient> => {
  if (!accessToken) {
    logger.error("No access token", { emailAccountId });
    throw new SafeError("No access token");
  }

  return createFastmailClient(accessToken, logger);
};
