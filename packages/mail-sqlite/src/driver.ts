export type SqlValue = null | string | number | Uint8Array;
export type SqlRow = Record<string, SqlValue>;

export interface SqlTransaction {
  exec(sql: string): Promise<void>;
  execute(
    sql: string,
    bindings?: readonly SqlValue[],
  ): Promise<{ changedRows: number }>;
  query(sql: string, bindings?: readonly SqlValue[]): Promise<SqlRow[]>;
}

export interface SqliteDriver {
  close(): Promise<void>;
  read<T>(work: (tx: SqlTransaction) => Promise<T>): Promise<T>;
  write<T>(work: (tx: SqlTransaction) => Promise<T>): Promise<T>;
}
