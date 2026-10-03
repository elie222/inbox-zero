import { randomUUID } from "node:crypto";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { getMockEmailProvider, getMockMessage } from "@/__tests__/helpers";
import type { EmailProvider } from "@/utils/email/types";
import prisma from "@/utils/prisma";
import {
  admitScheduledDraftResource,
  claimDraftResourceForSend,
  createDraftResource,
  discardDraftResource,
  finishDraftResourceSend,
  leaseDraftResourceForSend,
  readDraftResource,
  registerDraftResource,
  releaseCancelledDraftResource,
  releaseKnownUnsentDraftResource,
  updateDraftResource,
} from "@/utils/email/draft-resource";
import { scheduleEmail } from "@/utils/scheduled-email/service";

vi.mock("server-only", () => ({}));
vi.mock("@upstash/qstash", () => ({
  Client: class {
    publishJSON = vi.fn().mockResolvedValue({ messageId: "test-message" });
  },
}));

describe.skipIf(process.env.RUN_DB_TESTS !== "true")(
  "native draft resource journal (real Postgres)",
  { timeout: 30_000 },
  () => {
    const emails = [
      "draft-resource-journal-one@example.test",
      "draft-resource-journal-two@example.test",
    ];
    const content = {
      to: "recipient@example.test",
      subject: "Database ownership test",
      messageHtml: "<p>Unsent content</p>",
    };
    let accountId: string;
    let otherAccountId: string;
    let provider: ReturnType<typeof makeProvider>;
    let databaseVerified = false;

    beforeAll(() => {
      // A missing test URL must fail rather than delete rows in the default DB.
      for (const value of [
        process.env.DATABASE_URL,
        process.env.PREVIEW_DATABASE_URL,
      ]) {
        if (!value) continue;
        const url = new URL(value);
        if (
          !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
          !["/emulator", "/inboxzero_test"].includes(url.pathname)
        ) {
          throw new Error(
            "Draft journal DB tests require a throwaway loopback database.",
          );
        }
      }
      databaseVerified = true;
    });

    beforeEach(async () => {
      await prisma.user.deleteMany({ where: { email: { in: emails } } });
      [accountId, otherAccountId] = await Promise.all(emails.map(seedAccount));
      provider = makeProvider();
    });

    afterAll(async () => {
      if (databaseVerified) {
        await prisma.user.deleteMany({ where: { email: { in: emails } } });
      }
      await prisma.$disconnect();
    });

    test("enforces both account-scoped keys and canonicalizes concurrent imports", async () => {
      const registrations = await Promise.all(
        Array.from({ length: 8 }, (_, index) =>
          registerDraftResource({
            accountId,
            resourceKey: `device-${index}`,
            providerDraftId: "mailbox-draft",
          }),
        ),
      );
      const canonical = registrations[0];
      expect(new Set(registrations.map((row) => row.id)).size).toBe(1);
      expect(new Set(registrations.map((row) => row.resourceKey)).size).toBe(1);
      await expect(
        prisma.emailDraftResource.create({
          data: {
            emailAccountId: accountId,
            resourceKey: canonical.resourceKey,
          },
        }),
      ).rejects.toMatchObject({ code: "P2002" });
      await expect(
        prisma.emailDraftResource.create({
          data: {
            emailAccountId: accountId,
            resourceKey: "another-device",
            providerDraftId: "mailbox-draft",
          },
        }),
      ).rejects.toMatchObject({ code: "P2002" });
      const other = await registerDraftResource({
        accountId: otherAccountId,
        resourceKey: canonical.resourceKey,
        providerDraftId: "mailbox-draft",
      });
      expect(other.id).not.toBe(canonical.id);
      expect(
        await prisma.emailDraftResource.count({
          where: { emailAccountId: { in: [accountId, otherAccountId] } },
        }),
      ).toBe(2);
    });

    test("admits one provider create across simultaneous journal requests", async () => {
      const entered = deferred<void>();
      const creation = deferred<{ id: string }>();
      provider.createDraft.mockImplementation(() => {
        entered.resolve();
        return creation.promise;
      });
      let completed = 0;
      const requests = Array.from({ length: 8 }, () =>
        createDraftResource({
          accountId,
          resourceKey: "concurrent-create",
          provider,
          content,
        }).finally(() => {
          completed += 1;
        }),
      );
      try {
        await entered.promise;
        await vi.waitFor(() => expect(completed).toBe(7));
        const pending = await prisma.emailDraftResource.findFirstOrThrow({
          where: { emailAccountId: accountId },
        });
        expect(pending).toMatchObject({
          owner: "DRAFT",
          state: "CREATING",
          providerDraftId: null,
        });
        expect(pending.leaseId).not.toBeNull();
        expect(provider.createDraft).toHaveBeenCalledOnce();
      } finally {
        creation.resolve({ id: "mailbox-draft" });
      }
      const results = await Promise.all(requests);
      expect(new Set(results.map((row) => row.id)).size).toBe(1);
      const saved = await prisma.emailDraftResource.findFirstOrThrow({
        where: { emailAccountId: accountId },
      });
      expect(saved).toMatchObject({
        state: "READY",
        providerDraftId: "mailbox-draft",
        leaseId: null,
      });
      expect(
        await prisma.emailDraftResource.count({
          where: { emailAccountId: accountId },
        }),
      ).toBe(1);
    });

    test("admits one send owner and one worker lease under competing requests", async () => {
      await registerDraftResource({
        accountId,
        resourceKey: "send-race",
        providerDraftId: "mailbox-draft",
      });
      const claims = await Promise.all(
        ["send-one", "send-two"].map((sendOperationId) =>
          claimDraftResourceForSend({
            accountId,
            resourceKey: "send-race",
            sendOperationId,
          }),
        ),
      );
      expect(claims.filter((claim) => claim.status === "ready")).toHaveLength(
        1,
      );
      expect(
        claims.filter((claim) => claim.status === "rejected"),
      ).toHaveLength(1);
      const owner = await prisma.emailDraftResource.findFirstOrThrow({
        where: { emailAccountId: accountId },
      });
      expect(owner.owner).toBe("SEND");
      expect(owner.sendOperationId).not.toBeNull();
      const leases = await Promise.all(
        Array.from({ length: 8 }, () =>
          leaseDraftResourceForSend({
            accountId,
            resourceKey: owner.resourceKey,
            sendOperationId: owner.sendOperationId!,
          }),
        ),
      );
      const admitted = leases.filter((lease) => "leaseId" in lease);
      expect(admitted).toHaveLength(1);
      const current = await prisma.emailDraftResource.findUniqueOrThrow({
        where: { id: owner.id },
      });
      expect(current.leaseId).toBe(admitted[0].leaseId);
      expect(current.sendOperationId).toBe(owner.sendOperationId);
    });

    test("send and discard cannot both own the same mailbox resource", async () => {
      const resourceKey = "send-discard-race";
      await registerDraftResource({
        accountId,
        resourceKey,
        providerDraftId: "mailbox-draft",
      });
      const [send] = await Promise.all([
        claimDraftResourceForSend({
          accountId,
          resourceKey,
          sendOperationId: "send",
        }),
        discardDraftResource({ accountId, resourceKey, provider }),
      ]);
      const saved = await prisma.emailDraftResource.findFirstOrThrow({
        where: { emailAccountId: accountId },
      });
      if (saved.owner === "SEND") {
        expect(saved).toMatchObject({
          state: "READY",
          sendOperationId: "send",
        });
        expect(send.status).toBe("ready");
        expect(provider.deleteDraft).not.toHaveBeenCalled();
      } else {
        expect(saved).toMatchObject({
          owner: "DISCARD",
          state: "CONSUMED",
          sendOperationId: null,
        });
        expect(send.status).toBe("rejected");
        expect(provider.deleteDraft).toHaveBeenCalledOnce();
      }
      expect(saved.leaseId).toBeNull();
    });

    test("concurrent discard requests share one provider deletion lease", async () => {
      const resourceKey = "discard-race";
      await registerDraftResource({
        accountId,
        resourceKey,
        providerDraftId: "mailbox-draft",
      });
      const entered = deferred<void>();
      const deletion = deferred<boolean>();
      provider.deleteDraft.mockImplementation(() => {
        entered.resolve();
        return deletion.promise;
      });
      const first = discardDraftResource({ accountId, resourceKey, provider });
      try {
        await entered.promise;
        await Promise.all(
          Array.from({ length: 7 }, () =>
            discardDraftResource({ accountId, resourceKey, provider }),
          ),
        );
        expect(provider.deleteDraft).toHaveBeenCalledOnce();
        const pending = await prisma.emailDraftResource.findFirstOrThrow({
          where: { emailAccountId: accountId },
        });
        expect(pending.owner).toBe("DISCARD");
        expect(pending.leaseId).not.toBeNull();
      } finally {
        deletion.resolve(true);
      }
      await first;
      expect(
        await prisma.emailDraftResource.findFirstOrThrow({
          where: { emailAccountId: accountId },
        }),
      ).toMatchObject({ owner: "DISCARD", state: "CONSUMED", leaseId: null });
    });

    test("a late create preserves discard ownership and durably records cleanup", async () => {
      const resourceKey = "late-create";
      const entered = deferred<void>();
      const creation = deferred<{ id: string }>();
      provider.createDraft.mockImplementation(() => {
        entered.resolve();
        return creation.promise;
      });
      const creating = createDraftResource({
        accountId,
        resourceKey,
        provider,
        content,
      });
      try {
        await entered.promise;
        const active = await prisma.emailDraftResource.findFirstOrThrow({
          where: { emailAccountId: accountId },
        });
        await discardDraftResource({ accountId, resourceKey, provider });
        expect(
          await prisma.emailDraftResource.findUniqueOrThrow({
            where: { id: active.id },
          }),
        ).toMatchObject({
          owner: "DISCARD",
          state: "CREATING",
          leaseId: active.leaseId,
        });
        expect(provider.deleteDraft).not.toHaveBeenCalled();
      } finally {
        creation.resolve({ id: "mailbox-draft" });
      }
      await creating;
      const saved = await prisma.emailDraftResource.findFirstOrThrow({
        where: { emailAccountId: accountId },
      });
      expect(saved).toMatchObject({
        owner: "DISCARD",
        state: "CONSUMED",
        providerDraftId: "mailbox-draft",
        leaseId: null,
      });
      expect(provider.deleteDraft).toHaveBeenCalledExactlyOnceWith(
        "mailbox-draft",
        "version-one",
      );
      expect(
        (
          await claimDraftResourceForSend({
            accountId,
            resourceKey,
            sendOperationId: "too-late",
          })
        ).status,
      ).toBe("rejected");
    });

    test("a visible mailbox import preserves the original late-create discard through an alias", async () => {
      const originalKey = "visibility-original";
      const importedKey = "visibility-import";
      const held = holdProviderCreate(provider);
      const creating = createDraftResource({
        accountId,
        resourceKey: originalKey,
        provider,
        content,
      });
      try {
        await held.entered.promise;
        await registerDraftResource({
          accountId,
          resourceKey: importedKey,
          providerDraftId: "mailbox-draft",
        });
        await discardDraftResource({
          accountId,
          resourceKey: originalKey,
          provider,
        });
      } finally {
        held.creation.resolve({ id: "mailbox-draft" });
        await creating;
      }
      const canonical = await readDraftResource(accountId, importedKey);
      const original = await readDraftResource(accountId, originalKey);
      expect(canonical).toMatchObject({
        owner: "DISCARD",
        state: "CONSUMED",
        providerDraftId: "mailbox-draft",
        leaseId: null,
      });
      expect(original).toEqual(canonical);
      const alias = await prisma.emailDraftResource.findUniqueOrThrow({
        where: {
          emailAccountId_resourceKey: {
            emailAccountId: accountId,
            resourceKey: originalKey,
          },
        },
      });
      expect(alias).toMatchObject({
        canonicalResourceId: canonical?.id,
        state: "CONSUMED",
        providerDraftId: null,
        leaseId: null,
      });
      expect(provider.createDraft).toHaveBeenCalledOnce();
      expect(provider.deleteDraft).toHaveBeenCalledExactlyOnceWith(
        "mailbox-draft",
        "version-one",
      );
      expect(
        (
          await claimDraftResourceForSend({
            accountId,
            resourceKey: originalKey,
            sendOperationId: "too-late",
          })
        ).status,
      ).toBe("rejected");
    });

    test("alias merge adopts the original's current send owner rather than its stale create snapshot", async () => {
      const originalKey = "send-original";
      const importedKey = "send-import";
      const held = holdProviderCreate(provider);
      const creating = createDraftResource({
        accountId,
        resourceKey: originalKey,
        provider,
        content,
      });
      try {
        await held.entered.promise;
        await registerDraftResource({
          accountId,
          resourceKey: importedKey,
          providerDraftId: "mailbox-draft",
        });
        const claimed = await claimDraftResourceForSend({
          accountId,
          resourceKey: originalKey,
          sendOperationId: "original-send",
        });
        expect(claimed.status).toBe("retry");
      } finally {
        held.creation.resolve({ id: "mailbox-draft" });
        await creating;
      }
      const canonical = await readDraftResource(accountId, importedKey);
      expect(canonical).toMatchObject({
        owner: "SEND",
        state: "READY",
        sendOperationId: "original-send",
        providerDraftId: "mailbox-draft",
        leaseId: null,
      });
      expect(await readDraftResource(accountId, originalKey)).toEqual(
        canonical,
      );
      const send = await leaseDraftResourceForSend({
        accountId,
        resourceKey: originalKey,
        sendOperationId: "original-send",
      });
      expect(send.status).toBe("ready");
      expect("leaseId" in send).toBe(true);
      expect(send.resource.id).toBe(canonical?.id);
      expect(
        (
          await claimDraftResourceForSend({
            accountId,
            resourceKey: importedKey,
            sendOperationId: "competing-send",
          })
        ).status,
      ).toBe("rejected");
      expect(provider.deleteDraft).not.toHaveBeenCalled();
      expect(provider.createDraft).toHaveBeenCalledOnce();
    });

    test("an already leased canonical send survives an original-key discard and late-create merge", async () => {
      const originalKey = "leased-original";
      const importedKey = "leased-import";
      const held = holdProviderCreate(provider);
      const creating = createDraftResource({
        accountId,
        resourceKey: originalKey,
        provider,
        content,
      });
      let expectedLease: string | null = null;
      try {
        await held.entered.promise;
        await registerDraftResource({
          accountId,
          resourceKey: importedKey,
          providerDraftId: "mailbox-draft",
        });
        const send = await leaseDraftResourceForSend({
          accountId,
          resourceKey: importedKey,
          sendOperationId: "canonical-send",
        });
        if (!("leaseId" in send))
          throw new Error("Expected the canonical send lease");
        expectedLease = send.leaseId;
        await discardDraftResource({
          accountId,
          resourceKey: originalKey,
          provider,
        });
      } finally {
        held.creation.resolve({ id: "mailbox-draft" });
        await creating;
      }
      expect(expectedLease).not.toBeNull();
      const canonical = await readDraftResource(accountId, importedKey);
      expect(canonical).toMatchObject({
        owner: "SEND",
        state: "READY",
        sendOperationId: "canonical-send",
        leaseId: expectedLease,
      });
      expect(await readDraftResource(accountId, originalKey)).toEqual(
        canonical,
      );
      expect(
        (
          await leaseDraftResourceForSend({
            accountId,
            resourceKey: originalKey,
            sendOperationId: "original-send",
          })
        ).status,
      ).toBe("rejected");
      expect(provider.deleteDraft).not.toHaveBeenCalled();
      expect(provider.createDraft).toHaveBeenCalledOnce();
    });

    test("an already consumed canonical discard survives a competing original send", async () => {
      const originalKey = "discarded-original";
      const importedKey = "discarded-import";
      const held = holdProviderCreate(provider);
      const creating = createDraftResource({
        accountId,
        resourceKey: originalKey,
        provider,
        content,
      });
      try {
        await held.entered.promise;
        await registerDraftResource({
          accountId,
          resourceKey: importedKey,
          providerDraftId: "mailbox-draft",
        });
        await claimDraftResourceForSend({
          accountId,
          resourceKey: originalKey,
          sendOperationId: "original-send",
        });
        await discardDraftResource({
          accountId,
          resourceKey: importedKey,
          provider,
        });
        provider.getDraft.mockResolvedValue(null);
      } finally {
        held.creation.resolve({ id: "mailbox-draft" });
        await creating;
      }
      const canonical = await readDraftResource(accountId, importedKey);
      expect(canonical).toMatchObject({
        owner: "DISCARD",
        state: "CONSUMED",
        sendOperationId: null,
        leaseId: null,
      });
      expect(await readDraftResource(accountId, originalKey)).toEqual(
        canonical,
      );
      expect(
        (
          await claimDraftResourceForSend({
            accountId,
            resourceKey: originalKey,
            sendOperationId: "original-send",
          })
        ).status,
      ).toBe("rejected");
      expect(provider.createDraft).toHaveBeenCalledOnce();
      expect(provider.deleteDraft).toHaveBeenCalledOnce();
    });

    test("an old-key claim racing alias conversion shares the canonical send owner and worker lease", async () => {
      const originalKey = "racing-original";
      const importedKey = "racing-import";
      const held = holdProviderCreate(provider);
      const creating = createDraftResource({
        accountId,
        resourceKey: originalKey,
        provider,
        content,
      });
      try {
        await held.entered.promise;
        await registerDraftResource({
          accountId,
          resourceKey: importedKey,
          providerDraftId: "mailbox-draft",
        });
        held.creation.resolve({ id: "mailbox-draft" });
        const [, claim] = await Promise.all([
          creating,
          claimDraftResourceForSend({
            accountId,
            resourceKey: originalKey,
            sendOperationId: "racing-send",
          }),
        ]);
        expect(["ready", "retry"]).toContain(claim.status);
        const canonical = await readDraftResource(accountId, importedKey);
        expect(canonical).toMatchObject({
          owner: "SEND",
          sendOperationId: "racing-send",
          state: "READY",
        });
        expect(await readDraftResource(accountId, originalKey)).toEqual(
          canonical,
        );
        const leases = await Promise.all(
          [originalKey, importedKey].map((resourceKey) =>
            leaseDraftResourceForSend({
              accountId,
              resourceKey,
              sendOperationId: "racing-send",
            }),
          ),
        );
        expect(leases.filter((lease) => "leaseId" in lease)).toHaveLength(1);
        expect(
          leases.every((lease) => lease.resource.id === canonical?.id),
        ).toBe(true);
        expect(provider.createDraft).toHaveBeenCalledOnce();
        expect(provider.deleteDraft).not.toHaveBeenCalled();
      } finally {
        held.creation.resolve({ id: "mailbox-draft" });
        await creating;
      }
    });

    test("a database insert failure atomically rolls back scheduled admission and leaves the draft editable", async () => {
      const resourceKey = "rollback-admission";
      const resource = await registerDraftResource({
        accountId,
        resourceKey,
        providerDraftId: "mailbox-draft",
      });
      await prisma.$executeRaw`ALTER TABLE "ScheduledEmail" ADD CONSTRAINT "draft_resource_admission_test_reject" CHECK ("payloadHash" <> 'forced-rollback')`;
      try {
        await expect(
          admitScheduledDraftResource({
            accountId,
            resourceKey,
            sendOperationId: randomUUID(),
            payloadHash: "forced-rollback",
            payload: { email: content },
            threadId: null,
            sendAt: new Date(Date.now() + 60_000),
            remindAt: null,
            heldForUndo: true,
          }),
        ).rejects.toThrow();
        expect(
          await prisma.scheduledEmail.count({
            where: { emailAccountId: accountId },
          }),
        ).toBe(0);
        expect(
          await prisma.emailDraftResource.findUniqueOrThrow({
            where: { id: resource.id },
          }),
        ).toMatchObject({
          owner: "DRAFT",
          state: "READY",
          sendOperationId: null,
          leaseId: null,
        });
        await updateDraftResource({
          accountId,
          resourceKey,
          provider,
          content,
        });
        expect(provider.updateDraft).toHaveBeenCalledOnce();
      } finally {
        await prisma.$executeRaw`ALTER TABLE "ScheduledEmail" DROP CONSTRAINT "draft_resource_admission_test_reject"`;
      }
    });

    test("concurrent alias admissions create one matching undo hold and keep another account isolated", async () => {
      const originalKey = "admission-original";
      const importedKey = "admission-import";
      const held = holdProviderCreate(provider);
      const creating = createDraftResource({
        accountId,
        resourceKey: originalKey,
        provider,
        content,
      });
      try {
        await held.entered.promise;
        await registerDraftResource({
          accountId,
          resourceKey: importedKey,
          providerDraftId: "mailbox-draft",
        });
      } finally {
        held.creation.resolve({ id: "mailbox-draft" });
        await creating;
      }
      const requests = Array.from({ length: 8 }, (_, index) => ({
        accountId,
        resourceKey: index % 2 ? originalKey : importedKey,
        sendOperationId: randomUUID(),
        payloadHash: `hash-${index}`,
        payload: { email: content },
        threadId: null,
        sendAt: new Date(Date.now() + 60_000),
        remindAt: null,
        heldForUndo: true,
      }));
      const admissions = await Promise.all(
        requests.map(admitScheduledDraftResource),
      );
      expect(admissions.filter(Boolean)).toHaveLength(1);
      const scheduled = await prisma.scheduledEmail.findFirstOrThrow({
        where: { emailAccountId: accountId },
      });
      const winner = requests.find(
        (request) => request.sendOperationId === scheduled.clientMutationId,
      );
      expect(winner).toBeDefined();
      expect(scheduled).toMatchObject({
        heldForUndo: true,
        status: "PENDING",
        payloadHash: winner?.payloadHash,
        payload: winner?.payload,
      });
      const canonical = await readDraftResource(accountId, importedKey);
      expect(canonical).toMatchObject({
        owner: "SEND",
        sendOperationId: scheduled.clientMutationId,
        leaseId: null,
      });
      expect(await readDraftResource(accountId, originalKey)).toEqual(
        canonical,
      );
      expect(
        await prisma.scheduledEmail.count({
          where: { emailAccountId: accountId },
        }),
      ).toBe(1);
      await registerDraftResource({
        accountId: otherAccountId,
        resourceKey: originalKey,
        providerDraftId: "mailbox-draft",
      });
      const other = await admitScheduledDraftResource({
        ...requests[0],
        accountId: otherAccountId,
        resourceKey: originalKey,
        sendOperationId: scheduled.clientMutationId,
      });
      expect(other).toMatchObject({
        emailAccountId: otherAccountId,
        clientMutationId: scheduled.clientMutationId,
      });
      expect(
        await readDraftResource(otherAccountId, originalKey),
      ).toMatchObject({
        owner: "SEND",
        sendOperationId: scheduled.clientMutationId,
      });
      expect(
        await prisma.scheduledEmail.count({
          where: { emailAccountId: { in: [accountId, otherAccountId] } },
        }),
      ).toBe(2);
    });

    test("retry after a lost scheduled response preserves the committed immutable row and SEND owner", async () => {
      const resourceKey = "lost-admission-response";
      await registerDraftResource({
        accountId,
        resourceKey,
        providerDraftId: "mailbox-draft",
      });
      const input = {
        clientMutationId: randomUUID(),
        threadId: null,
        messageIds: [],
        email: { ...content, draftResourceKey: resourceKey },
        sendAt: new Date(Date.now() + 60_000).toISOString(),
        remindAt: null,
      };
      // The caller loses the first result after the real database commit.
      await scheduleEmail(accountId, input);
      const committed = await prisma.scheduledEmail.findFirstOrThrow({
        where: { emailAccountId: accountId },
      });
      const retried = await scheduleEmail(accountId, input);
      expect(retried).toEqual(committed);
      await expect(
        scheduleEmail(accountId, {
          ...input,
          email: { ...input.email, subject: "Changed payload" },
        }),
      ).rejects.toThrow();
      await expect(
        scheduleEmail(accountId, { ...input, clientMutationId: randomUUID() }),
      ).rejects.toThrow("another pending operation");
      expect(
        await prisma.scheduledEmail.count({
          where: { emailAccountId: accountId },
        }),
      ).toBe(1);
      expect(
        await prisma.scheduledEmail.findUniqueOrThrow({
          where: { id: committed.id },
        }),
      ).toEqual(committed);
      expect(await readDraftResource(accountId, resourceKey)).toMatchObject({
        owner: "SEND",
        sendOperationId: input.clientMutationId,
        state: "READY",
        leaseId: null,
      });
      expect(provider.createDraft).not.toHaveBeenCalled();
    });

    test("an expired lease becomes uncertain without replaying the provider write", async () => {
      const row = await prisma.emailDraftResource.create({
        data: {
          emailAccountId: accountId,
          resourceKey: "expired-create",
          state: "CREATING",
          leaseId: "old-lease",
          leaseStartedAt: new Date(Date.now() - 180_000),
        },
      });
      expect(await readDraftResource(accountId, row.resourceKey)).toMatchObject(
        { state: "UNCERTAIN", leaseId: "old-lease" },
      );
      await createDraftResource({
        accountId,
        resourceKey: row.resourceKey,
        provider,
        content,
      });
      expect(provider.createDraft).not.toHaveBeenCalled();
      const claim = await leaseDraftResourceForSend({
        accountId,
        resourceKey: row.resourceKey,
        sendOperationId: "send",
      });
      expect(claim.status).toBe("uncertain");
      expect(
        await prisma.emailDraftResource.findUniqueOrThrow({
          where: { id: row.id },
        }),
      ).toMatchObject({
        owner: "SEND",
        state: "UNCERTAIN",
        leaseId: "old-lease",
      });
    });

    test("known-unsent release permits a new retry without an old operation reclaiming it", async () => {
      const resourceKey = "unsent-retry";
      await registerDraftResource({
        accountId,
        resourceKey,
        providerDraftId: "mailbox-draft",
      });
      const old = await leaseDraftResourceForSend({
        accountId,
        resourceKey,
        sendOperationId: "old-send",
      });
      if (!("leaseId" in old))
        throw new Error("Expected the initial send lease");
      await finishDraftResourceSend(old.resource, old.leaseId, "unsent");
      expect(
        await prisma.emailDraftResource.findUniqueOrThrow({
          where: { id: old.resource.id },
        }),
      ).toMatchObject({
        owner: "DRAFT",
        state: "READY",
        sendOperationId: null,
        leaseId: null,
      });
      const retry = await leaseDraftResourceForSend({
        accountId,
        resourceKey,
        sendOperationId: "new-send",
      });
      if (!("leaseId" in retry))
        throw new Error("Expected the retry send lease");
      await releaseKnownUnsentDraftResource(accountId, "old-send");
      await expect(
        finishDraftResourceSend(old.resource, old.leaseId, "sent"),
      ).rejects.toThrow("lease was lost");
      expect(
        await prisma.emailDraftResource.findUniqueOrThrow({
          where: { id: old.resource.id },
        }),
      ).toMatchObject({
        owner: "SEND",
        state: "READY",
        sendOperationId: "new-send",
        leaseId: retry.leaseId,
      });
    });

    test("definitely unsent admission releases the resource for editing and protects a newer send", async () => {
      const resourceKey = "rejected-edit";
      await registerDraftResource({
        accountId,
        resourceKey,
        providerDraftId: "mailbox-draft",
      });
      await claimDraftResourceForSend({
        accountId,
        resourceKey,
        sendOperationId: "rejected-send",
      });
      await releaseKnownUnsentDraftResource(accountId, "rejected-send");
      await updateDraftResource({
        accountId,
        resourceKey,
        provider,
        content: { ...content, subject: "Edited after rejection" },
      });
      expect(
        await prisma.emailDraftResource.findFirstOrThrow({
          where: { emailAccountId: accountId },
        }),
      ).toMatchObject({
        owner: "DRAFT",
        state: "READY",
        sendOperationId: null,
        leaseId: null,
      });
      expect(provider.updateDraft).toHaveBeenCalledOnce();
      expect(provider.createDraft).not.toHaveBeenCalled();
      await claimDraftResourceForSend({
        accountId,
        resourceKey,
        sendOperationId: "new-send",
      });
      await releaseKnownUnsentDraftResource(accountId, "rejected-send");
      expect(
        await prisma.emailDraftResource.findFirstOrThrow({
          where: { emailAccountId: accountId },
        }),
      ).toMatchObject({
        owner: "SEND",
        sendOperationId: "new-send",
        state: "READY",
      });
    });

    test("confirmed cancellation preserves an in-flight create lease and releases its late ID to Drafts", async () => {
      const resourceKey = "cancelled-create";
      const entered = deferred<void>();
      const creation = deferred<{ id: string }>();
      provider.createDraft.mockImplementation(() => {
        entered.resolve();
        return creation.promise;
      });
      const creating = createDraftResource({
        accountId,
        resourceKey,
        provider,
        content,
      });
      try {
        await entered.promise;
        await claimDraftResourceForSend({
          accountId,
          resourceKey,
          sendOperationId: "cancelled-send",
        });
        const active = await prisma.emailDraftResource.findFirstOrThrow({
          where: { emailAccountId: accountId },
        });
        await releaseCancelledDraftResource(accountId, "unrelated-send");
        expect(
          (
            await prisma.emailDraftResource.findUniqueOrThrow({
              where: { id: active.id },
            })
          ).owner,
        ).toBe("SEND");
        await releaseCancelledDraftResource(accountId, "cancelled-send");
        expect(
          await prisma.emailDraftResource.findUniqueOrThrow({
            where: { id: active.id },
          }),
        ).toMatchObject({
          owner: "DRAFT",
          state: "CREATING",
          leaseId: active.leaseId,
          sendOperationId: null,
        });
      } finally {
        creation.resolve({ id: "mailbox-draft" });
      }
      await creating;
      expect(
        await prisma.emailDraftResource.findFirstOrThrow({
          where: { emailAccountId: accountId },
        }),
      ).toMatchObject({
        owner: "DRAFT",
        state: "READY",
        providerDraftId: "mailbox-draft",
        leaseId: null,
      });
      expect(provider.deleteDraft).not.toHaveBeenCalled();
    });
  },
);

async function seedAccount(email: string) {
  const user = await prisma.user.create({ data: { email } });
  const account = await prisma.account.create({
    data: {
      userId: user.id,
      provider: "google",
      providerAccountId: `provider-${email}`,
      type: "oauth",
    },
  });
  return (
    await prisma.emailAccount.create({
      data: { accountId: account.id, email, userId: user.id },
    })
  ).id;
}

function makeProvider() {
  return {
    ...getMockEmailProvider(),
    createDraft: vi
      .fn<EmailProvider["createDraft"]>()
      .mockResolvedValue({ id: "mailbox-draft" }),
    updateDraft: vi
      .fn<EmailProvider["updateDraft"]>()
      .mockResolvedValue(undefined),
    getDraft: vi.fn<EmailProvider["getDraft"]>().mockResolvedValue(
      getMockMessage({
        id: "message",
        threadId: "thread",
        labelIds: ["DRAFT"],
      }),
    ),
    getDraftReferenceForMessage: vi
      .fn<EmailProvider["getDraftReferenceForMessage"]>()
      .mockResolvedValue({ id: "mailbox-draft", version: "version-one" }),
    deleteDraft: vi.fn<EmailProvider["deleteDraft"]>().mockResolvedValue(true),
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}

function holdProviderCreate(provider: ReturnType<typeof makeProvider>) {
  const entered = deferred<void>();
  const creation = deferred<{ id: string }>();
  provider.createDraft.mockImplementationOnce(() => {
    entered.resolve();
    return creation.promise;
  });
  return { entered, creation };
}
