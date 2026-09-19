export type HostRuntime = {
  nowMs(): number;
  randomId(): string;
  storagePressure(): boolean | Promise<boolean>;
};
