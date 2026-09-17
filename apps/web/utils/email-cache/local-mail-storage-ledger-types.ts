export type LocalMailStorageLedger = {
  id: "origin";
  version: 1;
  epoch: string;
  stores: Record<
    string,
    { bytes: number; complete: boolean; afterKey?: IDBValidKey }
  >;
  index: {
    status: "unknown" | "ready";
    bytes?: number;
    pending?: { token: string; reservedGrowthBytes: number };
  };
};
