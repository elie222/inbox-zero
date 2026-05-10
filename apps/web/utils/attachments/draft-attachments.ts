import { z } from "zod";
import type { Attachment as MailAttachment } from "nodemailer/lib/mailer";
import { PremiumTier } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { createGenerateObject } from "@/utils/llms";
import { getModel } from "@/utils/llms/model";
import { appendOllamaOnlySystemGuidance } from "@/utils/llms/ollama-guidance";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { Logger } from "@/utils/logger";
import { createDriveProviderWithRefresh } from "@/utils/drive/provider";
import type { DriveFile, DriveProvider } from "@/utils/drive/types";
import {
  cleanExtractedText,
  extractTextFromDocument,
  getDocumentPreview,
} from "@/utils/drive/document-extraction";
import prisma from "@/utils/prisma";
import { checkHasAccess } from "@/utils/premium/server";
import type { SelectedAttachment } from "@/utils/attachments/source-schema";

const MAX_ATTACHMENTS = 3;
const MAX_MODEL_CANDIDATES = 12;
const MAX_INDEX_TARGETS = 12;
const PDF_MIME_TYPE = "application/pdf";
const SOURCE_REFRESH_INTERVAL_MS = 15 * 60 * 1000;

const attachmentSelectionSchema = z.object({
  attachments: z
    .array(
      z.object({
        candidateId: z.string(),
        reason: z.string().min(1),
      }),
    )
    .max(MAX_ATTACHMENTS),
});

type AttachmentSourceWithDocuments = Prisma.AttachmentSourceGetPayload<{
  include: {
    documents: true;
    driveConnection: {
      select: {
        id: true;
        provider: true;
        accessToken: true;
        refreshToken: true;
        expiresAt: true;
        isConnected: true;
        emailAccountId: true;
      };
    };
  };
}>;

type SourceDocument = {
  document: AttachmentSourceWithDocuments["documents"][number];
  driveConnectionId: string;
  path: string | null;
};

type CandidateDocument = SourceDocument & {
  candidateId: string;
  preview: string;
  score: number;
};

type DiscoveredDriveFile = {
  file: DriveFile;
  path: string;
};

export async function selectDraftAttachmentsForRule({
  emailAccount,
  ruleId,
  emailContent,
  logger,
}: {
  emailAccount: EmailAccountWithAI;
  ruleId: string;
  emailContent: string;
  logger: Logger;
}): Promise<{
  selectedAttachments: SelectedAttachment[];
  attachmentContext: string | null;
}> {
  const hasAccess = await hasDraftAttachmentAccess(emailAccount.userId);
  if (!hasAccess) {
    return { selectedAttachments: [], attachmentContext: null };
  }

  const attachmentSources = await prisma.attachmentSource.findMany({
    where: {
      ruleId,
      rule: {
        emailAccountId: emailAccount.id,
      },
    },
    include: {
      documents: true,
      driveConnection: {
        select: {
          id: true,
          provider: true,
          accessToken: true,
          refreshToken: true,
          expiresAt: true,
          isConnected: true,
          emailAccountId: true,
        },
      },
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  if (!attachmentSources.length) {
    return { selectedAttachments: [], attachmentContext: null };
  }

  const providers = new Map<string, DriveProvider>();
  const documents = (
    await Promise.all(
      attachmentSources.map(async (source) => {
        const provider = await getDriveProvider({
          driveConnection: source.driveConnection,
          providers,
          logger,
        });

        if (!provider) {
          return getCachedSourceDocuments(source);
        }

        if (!shouldRefreshSourceDocuments(source.documents)) {
          return getCachedSourceDocuments(source);
        }

        return syncAttachmentSource({
          source,
          provider,
          emailContent,
          logger,
        });
      }),
    )
  ).flat();

  const dedupedDocuments = dedupeDocuments(documents);
  if (!dedupedDocuments.length) {
    return { selectedAttachments: [], attachmentContext: null };
  }

  const candidates = dedupedDocuments
    .map((document) => toCandidateDocument({ document, emailContent }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_MODEL_CANDIDATES);

  if (!candidates.length) {
    return { selectedAttachments: [], attachmentContext: null };
  }

  const selectedAttachments = await aiSelectRelevantAttachments({
    candidates,
    emailAccount,
    emailContent,
    logger,
  });

  if (!selectedAttachments.length) {
    return { selectedAttachments: [], attachmentContext: null };
  }

  return {
    selectedAttachments,
    attachmentContext: buildAttachmentContext(
      selectedAttachments,
      dedupedDocuments,
    ),
  };
}

export async function resolveDraftAttachments({
  emailAccountId,
  userId,
  selectedAttachments,
  logger,
}: {
  emailAccountId: string;
  userId: string;
  selectedAttachments: SelectedAttachment[];
  logger: Logger;
}): Promise<MailAttachment[]> {
  if (!selectedAttachments.length) return [];

  const hasAccess = await hasDraftAttachmentAccess(userId);
  if (!hasAccess) return [];

  const driveConnections = await prisma.driveConnection.findMany({
    where: {
      emailAccountId,
      id: {
        in: [
          ...new Set(selectedAttachments.map((item) => item.driveConnectionId)),
        ],
      },
      isConnected: true,
    },
    select: {
      id: true,
      provider: true,
      accessToken: true,
      refreshToken: true,
      expiresAt: true,
      isConnected: true,
      emailAccountId: true,
    },
  });

  const connectionMap = new Map(
    driveConnections.map((connection) => [connection.id, connection]),
  );
  const providers = new Map<string, DriveProvider>();
  const resolvedAttachments: MailAttachment[] = [];

  for (const selectedAttachment of selectedAttachments) {
    const driveConnection = connectionMap.get(
      selectedAttachment.driveConnectionId,
    );
    if (!driveConnection) continue;

    const provider = await getDriveProvider({
      driveConnection,
      providers,
      logger,
    });
    if (!provider) continue;

    try {
      const downloaded = await provider.downloadFile(selectedAttachment.fileId);
      if (!downloaded || downloaded.file.mimeType !== PDF_MIME_TYPE) continue;

      resolvedAttachments.push({
        filename: downloaded.file.name,
        content: downloaded.content,
        contentType: downloaded.file.mimeType,
      });
    } catch (error) {
      logger.warn("Failed to download draft attachment", {
        driveConnectionId: selectedAttachment.driveConnectionId,
        fileId: selectedAttachment.fileId,
        error,
      });
    }
  }

  return resolvedAttachments;
}

async function syncAttachmentSource({
  source,
  provider,
  emailContent,
  logger,
}: {
  source: AttachmentSourceWithDocuments;
  provider: DriveProvider;
  emailContent: string;
  logger: Logger;
}): Promise<SourceDocument[]> {
  const { files: discoveredFiles, capped } = await discoverSourceFiles({
    source,
    provider,
  });

  const discoveredFileIds = discoveredFiles.map((file) => file.file.id);

  // Only prune stale documents when we have a complete picture of what's in
  // the source. If discovery was capped (file count or depth limit), skipping
  // the deleteMany prevents valid attachments from being purged.
  if (!capped) {
    if (discoveredFileIds.length > 0) {
      await prisma.attachmentDocument.deleteMany({
        where: {
          attachmentSourceId: source.id,
          fileId: { notIn: discoveredFileIds },
        },
      });
    } else if (source.documents.length > 0) {
      await prisma.attachmentDocument.deleteMany({
        where: { attachmentSourceId: source.id },
      });
      return [];
    }
  }

  const existingDocuments = new Map(
    source.documents.map((document) => [document.fileId, document]),
  );
  const syncedDocuments: SourceDocument[] = [];
  const indexingTargets: Array<{
    documentId: string;
    file: DriveFile;
    path: string;
  }> = [];

  for (const discoveredFile of discoveredFiles) {
    const existingDocument = existingDocuments.get(discoveredFile.file.id);
    const metadata = {
      path: discoveredFile.path,
      size: discoveredFile.file.size ?? null,
      webUrl: discoveredFile.file.webUrl ?? null,
    };

    let documentRecord = existingDocument;

    if (!existingDocument) {
      documentRecord = await prisma.attachmentDocument.create({
        data: {
          attachmentSourceId: source.id,
          fileId: discoveredFile.file.id,
          name: discoveredFile.file.name,
          mimeType: discoveredFile.file.mimeType,
          modifiedAt: discoveredFile.file.modifiedAt ?? null,
          metadata,
        },
      });
    } else if (
      existingDocument.name !== discoveredFile.file.name ||
      existingDocument.mimeType !== discoveredFile.file.mimeType ||
      !isSameModifiedAt(
        existingDocument.modifiedAt,
        discoveredFile.file.modifiedAt ?? null,
      ) ||
      getDocumentPath(existingDocument.metadata) !== discoveredFile.path
    ) {
      documentRecord = await prisma.attachmentDocument.update({
        where: { id: existingDocument.id },
        data: {
          name: discoveredFile.file.name,
          mimeType: discoveredFile.file.mimeType,
          modifiedAt: discoveredFile.file.modifiedAt ?? null,
          metadata,
        },
      });
    }

    if (!documentRecord) continue;

    syncedDocuments.push({
      document: documentRecord,
      driveConnectionId: source.driveConnectionId,
      path: discoveredFile.path,
    });

    if (needsIndexing(documentRecord, discoveredFile.file)) {
      indexingTargets.push({
        documentId: documentRecord.id,
        file: discoveredFile.file,
        path: discoveredFile.path,
      });
    }
  }

  const selectedIndexTargets = indexingTargets
    .sort((a, b) => {
      const scoreDelta =
        computeDiscoveryScore({
          emailContent,
          file: b.file,
          path: b.path,
        }) -
        computeDiscoveryScore({
          emailContent,
          file: a.file,
          path: a.path,
        });

      if (scoreDelta !== 0) return scoreDelta;

      return (
        (b.file.modifiedAt?.getTime() ?? 0) -
        (a.file.modifiedAt?.getTime() ?? 0)
      );
    })
    .slice(0, MAX_INDEX_TARGETS);

  const indexedDocuments = new Map<
    string,
    AttachmentSourceWithDocuments["documents"][number]
  >();

  await Promise.all(
    selectedIndexTargets.map(async (target) => {
      const indexedDocument = await indexAttachmentDocument({
        provider,
        documentId: target.documentId,
        file: target.file,
        path: target.path,
        logger,
      });

      if (indexedDocument) {
        indexedDocuments.set(target.documentId, indexedDocument);
      }
    }),
  );

  return syncedDocuments.map((document) => ({
    ...document,
    document: indexedDocuments.get(document.document.id) || document.document,
  }));
}

async function discoverSourceFiles({
  source,
  provider,
}: {
  source: AttachmentSourceWithDocuments;
  provider: DriveProvider;
}): Promise<{ files: DiscoveredDriveFile[]; capped: boolean }> {
  if (source.type === "FILE") {
    const file = await provider.getFile(source.sourceId);
    if (!file || file.mimeType !== PDF_MIME_TYPE)
      return { files: [], capped: false };

    return {
      files: [{ file, path: source.sourcePath || file.name }],
      capped: false,
    };
  }

  const MAX_DISCOVERED_FILES = 500;
  const MAX_FOLDER_DEPTH = 5;

  const discoveredFiles: DiscoveredDriveFile[] = [];
  let capped = false;
  const queue: Array<{ folderId: string; path: string; depth: number }> = [
    {
      folderId: source.sourceId,
      path: source.sourcePath || source.name,
      depth: 0,
    },
  ];
  const visitedFolders = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visitedFolders.has(current.folderId)) continue;
    if (current.depth > MAX_FOLDER_DEPTH) {
      capped = true;
      continue;
    }
    if (discoveredFiles.length >= MAX_DISCOVERED_FILES) {
      capped = true;
      break;
    }
    visitedFolders.add(current.folderId);

    const [folders, files] = await Promise.all([
      provider.listFolders(current.folderId),
      provider.listFiles(current.folderId, { mimeTypes: [PDF_MIME_TYPE] }),
    ]);

    for (const folder of folders) {
      queue.push({
        folderId: folder.id,
        path: `${current.path}/${folder.name}`,
        depth: current.depth + 1,
      });
    }

    for (const file of files) {
      discoveredFiles.push({
        file,
        path: `${current.path}/${file.name}`,
      });
    }
  }

  return { files: discoveredFiles, capped };
}

async function indexAttachmentDocument({
  provider,
  documentId,
  file,
  path,
  logger,
}: {
  provider: DriveProvider;
  documentId: string;
  file: DriveFile;
  path: string;
  logger: Logger;
}) {
  try {
    const downloadedFile = await provider.downloadFile(file.id);
    if (!downloadedFile) {
      return prisma.attachmentDocument.update({
        where: { id: documentId },
        data: {
          indexedAt: new Date(),
          error: "File no longer available",
          content: null,
          summary: null,
          metadata: {
            path,
            size: file.size ?? null,
            webUrl: file.webUrl ?? null,
          },
        },
      });
    }

    const extraction = await extractTextFromDocument(
      downloadedFile.content,
      downloadedFile.file.mimeType,
      { logger },
    );

    const cleanedText = extraction ? cleanExtractedText(extraction.text) : "";
    const summary = cleanedText ? getDocumentPreview(cleanedText, 1200) : null;

    return prisma.attachmentDocument.update({
      where: { id: documentId },
      data: {
        indexedAt: new Date(),
        error: null,
        content: cleanedText || null,
        summary,
        metadata: {
          path,
          size: downloadedFile.file.size ?? null,
          webUrl: downloadedFile.file.webUrl ?? null,
          pageCount: extraction?.pageCount ?? null,
          truncated: extraction?.truncated ?? false,
        },
      },
    });
  } catch (error) {
    logger.warn("Failed to index attachment document", {
      documentId,
      error,
    });

    return prisma.attachmentDocument.update({
      where: { id: documentId },
      data: {
        indexedAt: new Date(),
        error: "Failed to index document",
      },
    });
  }
}

async function aiSelectRelevantAttachments({
  candidates,
  emailAccount,
  emailContent,
  logger,
}: {
  candidates: CandidateDocument[];
  emailAccount: EmailAccountWithAI;
  emailContent: string;
  logger: Logger;
}): Promise<SelectedAttachment[]> {
  const modelOptions = getModel(emailAccount.user, "economy");
  logger.info("Selecting draft attachments", {
    candidateCount: candidates.length,
    emailAccountId: emailAccount.id,
  });

  try {
    // createGenerateObject already wraps model retries/fallbacks; keep
    // attachment selection non-fatal if the LLM still fails after that.
    const generateObject = createGenerateObject({
      emailAccount,
      label: "Draft attachment selection",
      modelOptions,
      promptHardening: { trust: "untrusted", level: "full" },
    });

    const result = await generateObject({
      ...modelOptions,
      system: appendOllamaOnlySystemGuidance(
        {
          system: `You select approved PDF attachments for draft email replies.

Choose only files that would materially help answer the email.
Return an empty list when no candidate is clearly relevant.
Prefer the fewest helpful attachments. Never select more than ${MAX_ATTACHMENTS} files.
Do not invent candidate IDs or use files outside the provided list.`,
        },
        modelOptions,
        OLLAMA_ATTACHMENT_SELECTION_RESPONSE_GUIDANCE,
      ).system,
      prompt: `Inbound email:

<email>
${emailContent}
</email>

Approved PDF candidates:

${candidates
  .map(
    (candidate) => `<candidate>
id: ${candidate.candidateId}
filename: ${candidate.document.name}
path: ${candidate.path || candidate.document.name}
preview: ${candidate.preview || "No preview available"}
</candidate>`,
  )
  .join("\n\n")}`,
      schema: attachmentSelectionSchema,
    });

    const candidateMap = new Map(
      candidates.map((candidate) => [candidate.candidateId, candidate]),
    );

    const selectedAttachments = result.object.attachments
      .flatMap((selection) => {
        const candidate = candidateMap.get(selection.candidateId);
        if (!candidate) return [];

        return [
          {
            driveConnectionId: candidate.driveConnectionId,
            fileId: candidate.document.fileId,
            filename: candidate.document.name,
            mimeType: candidate.document.mimeType,
            reason: selection.reason,
          } satisfies SelectedAttachment,
        ];
      })
      .slice(0, MAX_ATTACHMENTS);

    logger.info("Selected draft attachments", {
      candidateCount: candidates.length,
      emailAccountId: emailAccount.id,
      selectedCount: selectedAttachments.length,
    });

    return selectedAttachments;
  } catch (error) {
    logger.warn("Failed to select draft attachments", {
      candidateCount: candidates.length,
      emailAccountId: emailAccount.id,
      error,
    });
    return [];
  }
}

function buildAttachmentContext(
  selectedAttachments: SelectedAttachment[],
  documents: SourceDocument[],
) {
  const selectedByKey = new Map(
    selectedAttachments.map((attachment) => [
      `${attachment.driveConnectionId}:${attachment.fileId}`,
      attachment,
    ]),
  );

  const selectedDocuments = documents.filter((document) =>
    selectedByKey.has(
      `${document.driveConnectionId}:${document.document.fileId}`,
    ),
  );

  if (!selectedDocuments.length) return null;

  return selectedDocuments
    .map((document) => {
      const selectedAttachment = selectedByKey.get(
        `${document.driveConnectionId}:${document.document.fileId}`,
      );

      return `<attachment>
filename: ${document.document.name}
path: ${document.path || document.document.name}
reason: ${selectedAttachment?.reason || "Relevant to the inbound email"}
document_preview: ${
        document.document.summary ||
        getDocumentPreview(document.document.content || "", 1200) ||
        "No preview available"
      }
</attachment>`;
    })
    .join("\n\n");
}

async function getDriveProvider({
  driveConnection,
  providers,
  logger,
}: {
  driveConnection: AttachmentSourceWithDocuments["driveConnection"];
  providers: Map<string, DriveProvider>;
  logger: Logger;
}) {
  const existingProvider = providers.get(driveConnection.id);
  if (existingProvider) return existingProvider;

  try {
    const provider = await createDriveProviderWithRefresh(
      driveConnection,
      logger,
    );
    providers.set(driveConnection.id, provider);
    return provider;
  } catch (error) {
    logger.warn("Failed to access drive connection for attachments", {
      driveConnectionId: driveConnection.id,
      error,
    });
    return null;
  }
}

async function hasDraftAttachmentAccess(userId: string) {
  return checkHasAccess({ userId, minimumTier: PremiumTier.PLUS_MONTHLY });
}

function dedupeDocuments(documents: SourceDocument[]) {
  const dedupedDocuments = new Map<string, SourceDocument>();

  for (const document of documents) {
    const key = `${document.driveConnectionId}:${document.document.fileId}`;
    const existing = dedupedDocuments.get(key);

    if (
      !existing ||
      getDocumentRanking(document.document) >
        getDocumentRanking(existing.document)
    ) {
      dedupedDocuments.set(key, document);
    }
  }

  return [...dedupedDocuments.values()];
}

function getCachedSourceDocuments(source: AttachmentSourceWithDocuments) {
  return source.documents.map((document) => ({
    document,
    driveConnectionId: source.driveConnectionId,
    path: getDocumentPath(document.metadata) || source.sourcePath || null,
  }));
}

function toCandidateDocument({
  document,
  emailContent,
}: {
  document: SourceDocument;
  emailContent: string;
}): CandidateDocument {
  const preview =
    document.document.summary ||
    getDocumentPreview(document.document.content || "", 1200);

  return {
    ...document,
    candidateId: `${document.driveConnectionId}:${document.document.fileId}`,
    preview,
    score: scoreDocument({
      emailContent,
      name: document.document.name,
      path: document.path,
      preview,
    }),
  };
}

function getDocumentRanking(
  document: AttachmentSourceWithDocuments["documents"][number],
) {
  return (
    (document.content?.length || 0) +
    (document.summary?.length || 0) +
    (document.indexedAt ? 10_000 : 0) +
    (document.error ? -5000 : 0)
  );
}

function scoreDocument({
  emailContent,
  name,
  path,
  preview,
}: {
  emailContent: string;
  name: string;
  path: string | null;
  preview: string;
}) {
  const tokens = getSearchTokens(emailContent);
  const normalizedName = normalizeSearchText(name);
  const normalizedPath = normalizeSearchText(path || "");
  const normalizedPreview = normalizeSearchText(preview);

  let score = 0;

  for (const token of tokens) {
    if (normalizedName.includes(token)) score += 6;
    if (normalizedPath.includes(token)) score += 3;
    if (normalizedPreview.includes(token)) score += token.length >= 6 ? 4 : 1;
  }

  return score;
}

function computeDiscoveryScore({
  emailContent,
  file,
  path,
}: {
  emailContent: string;
  file: DriveFile;
  path: string;
}) {
  return (
    scoreDocument({
      emailContent,
      name: file.name,
      path,
      preview: "",
    }) +
    (file.modifiedAt?.getTime() ?? 0) / 1_000_000_000_000
  );
}

function getSearchTokens(text: string) {
  return [
    ...new Set(normalizeSearchText(text).match(/[\p{L}\p{N}]{3,}/gu) || []),
  ].slice(0, 50);
}

function normalizeSearchText(text: string) {
  return text.toLowerCase();
}

function needsIndexing(
  document: AttachmentSourceWithDocuments["documents"][number],
  file: DriveFile,
) {
  return (
    !document.indexedAt ||
    !document.content ||
    !!document.error ||
    !isSameModifiedAt(document.modifiedAt, file.modifiedAt ?? null)
  );
}

function shouldRefreshSourceDocuments(
  documents: AttachmentSourceWithDocuments["documents"],
) {
  if (documents.length === 0) return true;
  if (documents.every((document) => !document.indexedAt)) return true;

  const mostRecentUpdate = documents.reduce<number>(
    (latest, document) => Math.max(latest, document.updatedAt.getTime()),
    0,
  );

  return mostRecentUpdate < Date.now() - SOURCE_REFRESH_INTERVAL_MS;
}

function isSameModifiedAt(
  left: Date | null | undefined,
  right: Date | null | undefined,
) {
  if (!left && !right) return true;
  if (!left || !right) return false;
  return left.getTime() === right.getTime();
}

function getDocumentPath(metadata: Prisma.JsonValue | null) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const path = (metadata as { path?: unknown }).path;
  return typeof path === "string" ? path : null;
}

const OLLAMA_ATTACHMENT_SELECTION_RESPONSE_GUIDANCE = [
  'Each selected attachment must be an object with "candidateId" and "reason".',
  'Use the exact candidate id from the provided list, for example: {"attachments":[{"candidateId":"drive-1:file-123","reason":"Current certificate requested by property name"}]}',
  'When nothing is clearly relevant, return {"attachments":[]}.',
] as const;
