import type { Sha256Fn } from "@inboxzero/mail-core/canonical";
import {
  createBlobStore,
  type BlobFileSystem,
  type MailBlobStore,
} from "./blob-store";

export { createBlobStore, type BlobFileSystem, type MailBlobStore };

type ExpoDirectory = {
  exists: boolean;
  uri: string;
  create(options?: { intermediates?: boolean; idempotent?: boolean }): void;
  list(): Array<{ name: string }>;
};

type ExpoFile = {
  exists: boolean;
  name: string;
  create(options?: { intermediates?: boolean; overwrite?: boolean }): void;
  write(content: Uint8Array): void;
  bytes(): Promise<Uint8Array>;
  delete(): void;
  move(destination: ExpoFile): void;
  info(): { modificationTime?: number | null };
};

type FileSystemModule = {
  Directory: new (
    ...uris: Array<string | ExpoDirectory | ExpoFile>
  ) => ExpoDirectory;
  File: new (...uris: Array<string | ExpoDirectory | ExpoFile>) => ExpoFile;
  Paths: { document: ExpoDirectory };
};

export async function createExpoBlobStore(input: {
  sha256: Sha256Fn;
  directoryName?: string;
}): Promise<MailBlobStore> {
  const fileSystem = (await import(
    "expo-file-system"
  )) as unknown as FileSystemModule;
  const root = new fileSystem.Directory(
    fileSystem.Paths.document,
    input.directoryName ?? "mail-blobs",
  );
  if (!root.exists) root.create({ intermediates: true, idempotent: true });
  return createBlobStore({
    sha256: input.sha256,
    files: createExpoBlobFiles(fileSystem, root),
  });
}

function createExpoBlobFiles(
  fileSystem: FileSystemModule,
  root: ExpoDirectory,
): BlobFileSystem {
  const fileAt = (name: string) => {
    if (name.includes("/") || name.includes("\\") || name.includes("..")) {
      throw new Error("invalid blob file name");
    }
    return new fileSystem.File(root, name);
  };
  return {
    async writeNew(name, bytes) {
      const file = fileAt(name);
      if (file.exists) return "exists";
      try {
        file.create({ intermediates: true });
        file.write(bytes);
        return "created";
      } catch (error) {
        if (file.exists) file.delete();
        throw error;
      }
    },
    async read(name) {
      const file = fileAt(name);
      if (!file.exists) return null;
      return file.bytes();
    },
    async rename(from, to) {
      const source = fileAt(from);
      const destination = fileAt(to);
      if (destination.exists) destination.delete();
      source.move(destination);
    },
    async remove(name) {
      const file = fileAt(name);
      if (file.exists) file.delete();
    },
    async list() {
      if (!root.exists) return [];
      return root.list().map((entry) => entry.name);
    },
    async mtimeMs(name) {
      const file = fileAt(name);
      if (!file.exists) return null;
      const modificationTime = file.info().modificationTime;
      if (modificationTime == null || !Number.isFinite(modificationTime)) {
        return null;
      }
      return modificationTime > 1_000_000_000_000
        ? modificationTime
        : modificationTime * 1000;
    },
  };
}
