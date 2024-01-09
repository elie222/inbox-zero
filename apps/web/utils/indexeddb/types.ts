import { DBSchema } from "idb";
import { gmail_v1 } from "googleapis";

export interface InboxZeroDB extends DBSchema {
  labels: {
    key: string;
    value: gmail_v1.Schema$Label;
    indexes: {};
  };
  emails: {
    key: string;
    // TODO
    value: gmail_v1.Schema$Thread;
    indexes: {};
  };
}
