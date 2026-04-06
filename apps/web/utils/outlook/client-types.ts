import type { Client } from "@microsoft/microsoft-graph-client";

export interface OutlookClient {
  getClient(): Client;
}
