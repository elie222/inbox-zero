import { normalizeMimeType } from "@inboxzero/mail-ui/image-preview";

export function getAttachmentFileType({
  mimeType,
  filename,
}: {
  mimeType: string;
  filename: string;
}) {
  const extension = filename.includes(".")
    ? filename.split(".").pop()?.toUpperCase()
    : undefined;
  const known =
    FILE_TYPES[normalizeMimeType(mimeType)] ??
    (extension === "PDF" ? FILE_TYPES["application/pdf"] : undefined);
  return {
    label: known?.label ?? (extension?.slice(0, 5) || "FILE"),
    className: known?.className || "bg-background text-muted-foreground border",
  };
}

const FILE_TYPES: Record<string, { label: string; className: string }> = {
  "application/pdf": {
    label: "PDF",
    className: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  },
  "application/zip": { label: "ZIP", className: "" },
  "image/png": { label: "PNG", className: "" },
  "image/jpeg": { label: "JPEG", className: "" },
  "image/gif": { label: "GIF", className: "" },
  "image/webp": { label: "WEBP", className: "" },
  "image/tiff": { label: "TIFF", className: "" },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
    label: "DOCX",
    className: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  },
  "application/msword": {
    label: "DOC",
    className: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
    label: "XLSX",
    className:
      "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  },
  "application/vnd.ms-excel": {
    label: "XLS",
    className:
      "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  },
  "text/csv": {
    label: "CSV",
    className:
      "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": {
    label: "PPTX",
    className:
      "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  },
  "application/vnd.ms-powerpoint": {
    label: "PPT",
    className:
      "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  },
};
