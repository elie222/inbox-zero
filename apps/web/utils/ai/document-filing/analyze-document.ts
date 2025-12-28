import { z } from "zod";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import { getModel } from "@/utils/llms/model";
import { createGenerateObject } from "@/utils/llms";
import { cleanExtractedText } from "@/utils/drive/document-extraction";

const documentAnalysisSchema = z
  .object({
    action: z
      .enum(["use_existing", "create_new", "skip"])
      .describe(
        "Whether to use an existing folder, create a new one, or skip this document.",
      ),
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
      .describe(
        "Brief explanation for why this folder was chosen or why the document was skipped.",
      ),
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

<output_format>
Your response must be in valid JSON format.
</output_format>

Choose one of:
1. action: "use_existing" + folderId - Use an existing folder from the list (requires folder ID)
2. action: "create_new" + folderPath - Create a new folder ONLY if:
   - The document clearly matches the user's preferences, AND
   - No existing folder fits, AND
   - The new folder makes sense for the user's stated filing goals
3. action: "skip" - Skip this document if:
   - It doesn't match the user's filing preferences
   - It's unrelated to what the user wants to organize
   - You're unsure whether it fits

Examples:
- User wants "file receipts" → Receipt PDF arrives → File it
- User wants "file receipts" → CV PDF arrives → SKIP (not a receipt)
- User wants "organize invoices by vendor" → Invoice arrives but no vendor folder exists → Create new folder for that vendor

Prefer existing folders. Only create folders that align with user preferences. When in doubt, skip.
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
