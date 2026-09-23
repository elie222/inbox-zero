declare module "expo-sqlite" {
  export function openDatabaseAsync(
    databaseName: string,
    options?: { useNewConnection?: boolean },
    directory?: string,
  ): Promise<{
    execAsync(source: string): Promise<void>;
    prepareAsync(source: string): Promise<{
      executeAsync(
        params?: readonly (null | string | number | Uint8Array)[],
      ): Promise<{
        changes: number;
        getAllAsync(): Promise<Record<string, unknown>[]>;
      }>;
      finalizeAsync(): Promise<void>;
    }>;
    withExclusiveTransactionAsync(
      task: (txn: {
        execAsync(source: string): Promise<void>;
        prepareAsync(source: string): Promise<{
          executeAsync(
            params?: readonly (null | string | number | Uint8Array)[],
          ): Promise<{
            changes: number;
            getAllAsync(): Promise<Record<string, unknown>[]>;
          }>;
          finalizeAsync(): Promise<void>;
        }>;
      }) => Promise<void>,
    ): Promise<void>;
    withTransactionAsync(task: () => Promise<void>): Promise<void>;
    closeAsync(): Promise<void>;
  }>;
  export function deleteDatabaseAsync(
    databaseName: string,
    directory?: string,
  ): Promise<void>;
}

declare module "expo-file-system" {
  export const Paths: {
    readonly document: { uri: string; exists: boolean };
    readonly availableDiskSpace: number;
  };
  export class Directory {
    constructor(...uris: unknown[]);
    exists: boolean;
    uri: string;
    create(options?: { intermediates?: boolean; idempotent?: boolean }): void;
    list(): Array<{ name: string }>;
  }
  export class File {
    constructor(...uris: unknown[]);
    exists: boolean;
    name: string;
    create(options?: { intermediates?: boolean }): void;
    write(content: Uint8Array): void;
    bytes(): Promise<Uint8Array>;
    delete(): void;
    move(destination: File): void;
    info(): { modificationTime?: number | null };
  }
}
