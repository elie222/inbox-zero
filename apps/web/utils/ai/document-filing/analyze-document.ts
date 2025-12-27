import { z } from "zod";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import { getModel } from "@/utils/llms/model";
import { createGenerateObject } from "@/utils/llms";
import { cleanExtractedText } from "@/utils/drive/document-extraction";

const documentAnalysisSchema = z
  .object({
    action: z
      .enum(["use_existing", "create_new"])
      .describe("Whether to use an existing folder or create a new one."),
    folderId: z
      .string()
      .optional()
      .describe(
        "Required if action is 'use_existing'. The ID of the existing folder from the provided list.",
      ),
    folderPath: z
      .string()
      .optional()
      .describe(
        "Required if action is 'create_new'. The path for the new folder to create.",
      ),
    confidence: z
      .number()
      .min(0)
      .max(1)
      .describe(
        "Confidence score from 0 to 1. Use 0.9+ only when very certain.",
      ),
    reasoning: z
      .string()
      .describe("Brief explanation for why this folder was chosen."),
  })
  .refine(
    (data) => {
      if (data.action === "use_existing") return !!data.folderId;
      if (data.action === "create_new") return !!data.folderPath;
      return true;
    },
    {
      message:
        "folderId required for 'use_existing', folderPath required for 'create_new'",
    },
  );
export type DocumentAnalysisResult = z.infer<typeof documentAnalysisSchema>;

type EmailContext = { subject: string; sender: string };
type AttachmentContext = { filename: string; content: string };
type DriveFolder = {
  id: string;
  name: string;
  path: string;
  driveProvider: string;
};

export async function analyzeDocument({
  emailAccount,
  email,
  attachment,
  folders,
}: {
  emailAccount: EmailAccountWithAI & { filingPrompt: string };
  email: EmailContext;
  attachment: AttachmentContext;
  folders: DriveFolder[];
}): Promise<DocumentAnalysisResult> {
  const modelOptions = getModel(emailAccount.user, "economy");

  const generateObject = createGenerateObject({
    emailAccount,
    label: "Document filing",
    modelOptions,
  });

  const result = await generateObject({
    ...modelOptions,
    system: buildSystem(emailAccount.filingPrompt),
    prompt: buildPrompt({ email, attachment, folders }),
    schema: documentAnalysisSchema,
  });

  return result.object;
}

function buildSystem(filingPrompt: string): string {
  return `You are a document filing assistant. Your job is to decide where to file documents based on the user's preferences.

<user_filing_preferences>
${filingPrompt}
</user_filing_preferences>

Follow these preferences to decide where each document should go.

IMPORTANT - You must choose one of:
1. action: "use_existing" + folderId - Pick an existing folder from the provided list (use the folder's ID)
2. action: "create_new" + folderPath - Suggest a new folder path if no existing folder fits

Prefer existing folders when possible. Only suggest creating new folders when necessary.
Be conservative with confidence scores - only use 0.9+ when very certain.`;
}

function buildPrompt({
  email,
  attachment,
  folders,
}: {
  email: EmailContext;
  attachment: AttachmentContext;
  folders: DriveFolder[];
}): string {
  const cleanedText = cleanExtractedText(attachment.content);
  const truncatedText =
    cleanedText.length > 8000
      ? `${cleanedText.slice(0, 8000)}\n\n[... document truncated ...]`
      : cleanedText;

  const foldersText =
    folders.length > 0
      ? folders
          .map(
            (f) =>
              `<folder id="${f.id}" path="${f.path}" provider="${f.driveProvider}" />`,
          )
          .join("\n")
      : "No existing folders found.";

  return `Decide where to file this document:

<document_metadata>
<filename>${attachment.filename}</filename>
<email_subject>${email.subject}</email_subject>
<email_sender>${email.sender}</email_sender>
</document_metadata>

<document_content>
${truncatedText}
</document_content>

<existing_folders>
${foldersText}
</existing_folders>

Based on the user's filing preferences and the document content, decide where this document should be filed.`;
}
