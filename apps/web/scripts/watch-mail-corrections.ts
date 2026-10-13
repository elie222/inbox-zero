import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  renameSync,
  openSync,
  closeSync,
  unlinkSync,
  existsSync,
  appendFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { auth, gmail } from "@googleapis/gmail";
import { ImapFlow } from "imapflow";
import { z } from "zod";
import prisma from "@/utils/prisma";
import { decryptToken } from "@/utils/encryption";
import {
  observationStateSchema,
  observationSchema,
  completeSnapshot,
  observeChanges,
  type Observation,
} from "@/utils/mail-corrections/changes";
import {
  googleStateSchema,
  imapStateSchema,
  readGoogleCorrections,
  readICloudCorrections,
} from "@/utils/mail-corrections/providers";
import {
  learnCorrection,
  type CorrectionTarget,
} from "@/utils/mail-corrections/learning";
import { createScopedLogger } from "@/utils/logger";
import { filterNewSpamArrivals } from "@/utils/spam/worker-client";

const configSchema = z.object({
  intervalSeconds: z.number().int().min(10).default(45),
  settleSeconds: z.number().int().min(10).default(30),
  topicRuleNames: z.array(z.string().min(1)).min(1),
  inboxRuleName: z.string().min(1),
  junkRuleName: z.string().min(1),
  accounts: z
    .array(
      z.object({
        emailAccountId: z.string().regex(/^[a-zA-Z0-9_-]+$/),
        automaticRoutes: z
          .array(
            z.object({
              target: z.string(),
              recipientDomains: z.array(z.string()),
            }),
          )
          .default([]),
      }),
    )
    .min(1),
});
const stateSchema = z.object({
  version: z.literal(1),
  initialized: z.boolean(),
  observations: observationStateSchema,
  pendingArrivals: z.record(z.string(), observationSchema).default({}),
  google: googleStateSchema,
  imap: imapStateSchema,
  learned: z.number(),
  ignored: z.number(),
  automatic: z.number(),
  lastSuccessAt: z.number().optional(),
});
const logger = createScopedLogger("mail-corrections");
const clients = new Map<string, InstanceType<typeof auth.OAuth2>>();
const controller = new AbortController();
process.once("SIGTERM", () => controller.abort());
process.once("SIGINT", () => controller.abort());

async function main() {
  const { values } = parseArgs({
    options: {
      config: { type: "string" },
      "state-dir": { type: "string" },
      once: { type: "boolean" },
    },
  });
  if (!values.config || !values["state-dir"])
    throw new Error("Use --config PATH --state-dir DIRECTORY");
  const config = configSchema.parse(
    JSON.parse(readFileSync(resolve(values.config), "utf8")),
  );
  const directory = resolve(values["state-dir"]);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const lockPath = join(directory, "observer.lock");
  if (existsSync(lockPath)) {
    const pid = Number(readFileSync(lockPath, "utf8"));
    let alive = Number.isInteger(pid) && pid > 0;
    if (alive) {
      try {
        process.kill(pid, 0);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ESRCH") alive = false;
      }
    }
    if (alive) throw new Error("A correction observer is already running");
    unlinkSync(lockPath);
  }
  const lock = openSync(lockPath, "wx", 0o600);
  writeFileSync(lock, String(process.pid));
  closeSync(lock);
  const health: Record<string, Record<string, unknown>> = {};
  try {
    do {
      let failed = false;
      for (const accountConfig of config.accounts) {
        if (controller.signal.aborted) break;
        const file = join(directory, `${accountConfig.emailAccountId}.json`);
        try {
          const account = await prisma.emailAccount.findUnique({
            where: { id: accountConfig.emailAccountId },
            include: {
              account: true,
              iCloudConnection: true,
              rules: { where: { enabled: true }, include: { actions: true } },
            },
          });
          if (!account || account.account.disconnectedAt)
            throw new Error("Account unavailable");
          const state = existsSync(file)
            ? stateSchema.parse(JSON.parse(readFileSync(file, "utf8")))
            : stateSchema.parse({
                version: 1,
                initialized: false,
                observations: { observed: {}, pending: {} },
                google: {},
                imap: {},
                learned: 0,
                ignored: 0,
                automatic: 0,
              });
          const previouslyObserved = { ...state.observations.observed };
          const targets: CorrectionTarget[] = [];
          for (const name of config.topicRuleNames) {
            const rule = account.rules.find((r) => r.name === name);
            const action = rule?.actions.find(
              (a) => a.type === "LABEL" || a.type === "MOVE_FOLDER",
            );
            if (!rule || !action)
              throw new Error("Configured topic rule unavailable");
            targets.push({
              name,
              ruleId: rule.id,
              labelId: action.labelId ?? undefined,
              folderId: action.folderId ?? undefined,
            });
          }
          for (const [name, ruleName] of [
            ["@inbox", config.inboxRuleName],
            ["@junk", config.junkRuleName],
          ]) {
            const rule = account.rules.find((r) => r.name === ruleName);
            if (!rule)
              throw new Error("Correction destination rule unavailable");
            targets.push({
              name,
              ruleId: rule.id,
              labelId: name === "@inbox" ? "INBOX" : "SPAM",
              folderId:
                rule.actions.find((a) => a.type === "MOVE_FOLDER")?.folderId ??
                undefined,
            });
          }
          const now = Date.now();
          let result: { reset: boolean; current: Observation[] };
          if (account.account.provider === "google") {
            let oauth = clients.get(account.id);
            if (!oauth) {
              oauth = new auth.OAuth2(
                process.env.GOOGLE_CLIENT_ID,
                process.env.GOOGLE_CLIENT_SECRET,
              );
              oauth.setCredentials({
                access_token: account.account.access_token,
                refresh_token: account.account.refresh_token,
                expiry_date: account.account.expires_at?.getTime(),
              });
              clients.set(account.id, oauth);
            }
            const mapping = Object.fromEntries(
              targets.filter((t) => t.labelId).map((t) => [t.labelId!, t.name]),
            );
            mapping.TRASH = "@trash";
            result = await readGoogleCorrections({
              api: gmail({ version: "v1", auth: oauth }),
              state: state.google,
              observations: state.observations,
              targets: mapping,
              now,
            });
            if (
              oauth.credentials.access_token &&
              oauth.credentials.access_token !== account.account.access_token
            )
              await prisma.account.update({
                where: { id: account.accountId },
                data: {
                  access_token: oauth.credentials.access_token,
                  expires_at: oauth.credentials.expiry_date
                    ? new Date(oauth.credentials.expiry_date)
                    : undefined,
                },
              });
          } else if (
            account.account.provider === "icloud" &&
            account.iCloudConnection
          ) {
            const roles = z
              .object({
                inbox: z.string(),
                archive: z.string(),
                junk: z.string(),
                trash: z.string(),
              })
              .parse(account.iCloudConnection.folders);
            const mapping: Record<string, string> = {
              [roles.inbox]: "@inbox",
              [roles.archive]: "@archive",
              [roles.junk]: "@junk",
              [roles.trash]: "@trash",
            };
            for (const target of targets.filter(
              (t) => !t.name.startsWith("@"),
            )) {
              if (!target.folderId?.startsWith("imap:"))
                throw new Error("Invalid topic folder mapping");
              mapping[
                Buffer.from(target.folderId.slice(5), "base64url").toString(
                  "utf8",
                )
              ] = target.name;
            }
            const password = decryptToken(
              account.iCloudConnection.encryptedPassword,
            );
            if (!password) throw new Error("iCloud credential unavailable");
            const client = new ImapFlow({
              host: "imap.mail.me.com",
              port: 993,
              secure: true,
              auth: { user: account.iCloudConnection.username, pass: password },
              logger: false,
              disableAutoIdle: true,
              connectionTimeout: 15_000,
              socketTimeout: 20_000,
              tls: { rejectUnauthorized: true },
            });
            client.on("error", () => {});
            try {
              await client.connect();
              result = await readICloudCorrections({
                client,
                state: state.imap,
                targets: mapping,
                now,
              });
            } finally {
              client.close();
            }
            if (!result.reset)
              result.current = completeSnapshot(
                state.observations,
                result.current,
                now,
              );
          } else throw new Error("Unsupported account provider");
          const arrivalErrors = await filterNewSpamArrivals({
            emailAccountId: account.id,
            observations: result.current,
            previous: previouslyObserved,
            initialized: state.initialized && !result.reset,
            pending: state.pendingArrivals,
          });
          let processingErrors = arrivalErrors.length;
          for (const error of arrivalErrors)
            logger.warn("Spam arrival processing deferred", {
              emailAccountId: account.id,
              errorCode: error.name,
            });
          if (result.reset || !state.initialized)
            state.observations = { observed: {}, pending: {} };
          const ready = observeChanges(
            state.observations,
            result.current,
            now,
            config.settleSeconds * 1000,
          );
          for (const change of ready) {
            try {
              const outcome = await learnCorrection({
                emailAccountId: account.id,
                change,
                targets,
                automaticRoutes: accountConfig.automaticRoutes,
                logger,
              });
              state[outcome]++;
              delete state.observations.pending[change.after.key];
              appendFileSync(
                join(directory, "events.jsonl"),
                `${JSON.stringify({
                  at: now,
                  emailAccountId: account.id,
                  messageKey: change.after.key,
                  outcome,
                  before: change.before.targets,
                  after: change.after.targets,
                })}\n`,
                { mode: 0o600 },
              );
            } catch (error) {
              processingErrors++;
              logger.warn("Correction learning deferred", {
                emailAccountId: account.id,
                errorCode:
                  error instanceof Error ? error.name : "CorrectionError",
              });
            }
          }
          if (processingErrors) failed = true;
          state.initialized = true;
          state.lastSuccessAt = now;
          for (const [key, observation] of Object.entries(
            state.observations.observed,
          ))
            if (
              !observation.targets.length &&
              now - observation.observedAt > 86_400_000 &&
              !state.observations.pending[key]
            )
              delete state.observations.observed[key];
          atomicWrite(file, state);
          health[account.id] = {
            provider: account.account.provider,
            initialized: true,
            lastSuccessAt: now,
            trackedMessages: Object.keys(state.observations.observed).length,
            pending: Object.keys(state.observations.pending).length,
            pendingArrivals: Object.keys(state.pendingArrivals).length,
            processingErrors,
            learned: state.learned,
            ignored: state.ignored,
            automatic: state.automatic,
          };
          logger.info("Correction observation completed", health[account.id]);
        } catch (error) {
          failed = true;
          clients.delete(accountConfig.emailAccountId);
          health[accountConfig.emailAccountId] = {
            ...((health[accountConfig.emailAccountId] as object) ?? {}),
            errorAt: Date.now(),
            errorCode: error instanceof Error ? error.name : "ObservationError",
          };
          logger.warn("Correction observation deferred", {
            emailAccountId: accountConfig.emailAccountId,
            errorCode: error instanceof Error ? error.name : "ObservationError",
          });
        }
        atomicWrite(join(directory, "health.json"), health);
      }
      if (values.once && failed) process.exitCode = 1;
      if (!values.once)
        await delay(config.intervalSeconds * 1000, undefined, {
          signal: controller.signal,
        }).catch(() => {});
    } while (!values.once && !controller.signal.aborted);
  } finally {
    if (
      existsSync(lockPath) &&
      readFileSync(lockPath, "utf8") === String(process.pid)
    )
      unlinkSync(lockPath);
    await prisma.$disconnect();
  }
}

function atomicWrite(path: string, value: unknown) {
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(value), { mode: 0o600 });
  renameSync(temporary, path);
}

main().catch((error) => {
  logger.error("Correction observer stopped", {
    errorCode: error instanceof Error ? error.name : "ObserverError",
  });
  process.exitCode = 1;
});
