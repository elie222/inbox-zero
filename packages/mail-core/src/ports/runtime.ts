export type HostRuntime = {
  nowMs(): number;
  randomId(): string;
  sha256(bytes: Uint8Array): Promise<Uint8Array>;
  storagePressure(): boolean | Promise<boolean>;
};
