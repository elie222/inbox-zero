import { Readable } from "node:stream";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import { createObjectBlobStore } from "./object-store";

export function createS3UploadStore({
  client,
  bucket,
}: {
  client: S3Client;
  bucket: string;
}) {
  return createObjectBlobStore({
    async put(key, bytes, sizeBytes) {
      const body = Readable.from(bytes, { objectMode: false });
      try {
        await client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: body,
            ContentLength: sizeBytes,
            ContentType: "application/octet-stream",
          }),
          { abortSignal: AbortSignal.timeout(60_000) },
        );
      } finally {
        body.destroy();
      }
    },
    async read(key) {
      try {
        const response = await client.send(
          new GetObjectCommand({ Bucket: bucket, Key: key }),
          { abortSignal: AbortSignal.timeout(60_000) },
        );
        if (!response.Body) return null;
        return response.Body as AsyncIterable<Uint8Array>;
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "name" in error &&
          error.name === "NoSuchKey"
        )
          return null;
        throw error;
      }
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }), {
        abortSignal: AbortSignal.timeout(10_000),
      });
    },
  });
}
