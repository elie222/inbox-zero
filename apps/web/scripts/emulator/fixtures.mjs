import { readFileSync, writeFileSync } from "node:fs";

const filename = process.argv[2];
const seed = JSON.parse(readFileSync(filename, "utf8"));
seed.microsoft.messages = Array.from({ length: 65 }, (_, index) => ({
  id: `outlook-message-${index}`,
  conversation_id: `outlook-thread-${index}`,
  user_email: "developer@outlook.test",
  from: { address: "teammate@example.com", name: "Teammate" },
  to_recipients: [{ address: "developer@outlook.test" }],
  subject:
    index === 0 ? "Approval needed for Q2 metrics" : `Outlook fixture ${index}`,
  body_content: "<p>Synthetic provider integration fixture.</p>",
  body_content_type: "html",
  parent_folder_id: "inbox",
  is_read: index % 2 === 0,
  is_draft: false,
  inference_classification: "focused",
  received_date_time: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
}));
writeFileSync(filename, `${JSON.stringify(seed, null, 2)}\n`);
