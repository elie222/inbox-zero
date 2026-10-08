import "server-only";
import { S3Client } from "@aws-sdk/client-s3";
import type { BlobStore } from "@inboxzero/mail-core/ports/blob-store";
import { env } from "@/env";
import { createFilesystemUploadStore } from "./upload-storage/filesystem";
import { createS3UploadStore } from "./upload-storage/s3";
import { createVercelBlobUploadStore } from "./upload-storage/vercel-blob";

let store: BlobStore | undefined;

export function getMailUploadStore(): BlobStore {
  if (store) return store;
  switch (env.MAIL_UPLOAD_STORAGE) {
    case "s3": {
      if (!env.MAIL_UPLOAD_S3_BUCKET || !env.MAIL_UPLOAD_S3_REGION) {
        throw new Error(
          "S3 mail uploads require MAIL_UPLOAD_S3_BUCKET and MAIL_UPLOAD_S3_REGION",
        );
      }
      if (
        Boolean(env.MAIL_UPLOAD_S3_ACCESS_KEY_ID) !==
        Boolean(env.MAIL_UPLOAD_S3_SECRET_ACCESS_KEY)
      ) {
        throw new Error(
          "Set both S3 mail upload access key and secret, or neither to use the AWS credential chain",
        );
      }
      const client = new S3Client({
        region: env.MAIL_UPLOAD_S3_REGION,
        endpoint: env.MAIL_UPLOAD_S3_ENDPOINT,
        forcePathStyle: env.MAIL_UPLOAD_S3_FORCE_PATH_STYLE,
        requestChecksumCalculation: "WHEN_REQUIRED",
        credentials:
          env.MAIL_UPLOAD_S3_ACCESS_KEY_ID &&
          env.MAIL_UPLOAD_S3_SECRET_ACCESS_KEY
            ? {
                accessKeyId: env.MAIL_UPLOAD_S3_ACCESS_KEY_ID,
                secretAccessKey: env.MAIL_UPLOAD_S3_SECRET_ACCESS_KEY,
                sessionToken: env.MAIL_UPLOAD_S3_SESSION_TOKEN,
              }
            : undefined,
      });
      store = createS3UploadStore({
        client,
        bucket: env.MAIL_UPLOAD_S3_BUCKET,
      });
      break;
    }
    case "vercel-blob":
      store = createVercelBlobUploadStore(env.BLOB_READ_WRITE_TOKEN);
      break;
    default:
      store = createFilesystemUploadStore();
  }
  return store;
}
