export interface JMAPSession {
  apiUrl: string;
  accounts: Record<
    string,
    {
      name: string;
      isPersonal: boolean;
      isReadOnly: boolean;
      accountCapabilities: Record<string, unknown>;
    }
  >;
  primaryAccounts: Record<string, string>;
  username: string;
  capabilities: Record<string, Record<string, unknown>>;
  state: string;
}

export interface JMAPError {
  type: string;
  status?: number;
  detail?: string;
}

export interface JMAPMethodCall {
  methodName: string;
  args: Record<string, unknown>;
  id: string;
}

export interface JMAPResponse {
  methodResponses: Array<[string, Record<string, unknown>, string]>;
  sessionState: string;
}

export interface JMAPEmail {
  id: string;
  blobId: string;
  threadId: string;
  mailboxIds: Record<string, boolean>;
  keywords: Record<string, boolean>;
  size: number;
  receivedAt: string;
  messageId: string[];
  inReplyTo: string[] | null;
  references: string[] | null;
  sender: JMAPEmailAddress[] | null;
  from: JMAPEmailAddress[] | null;
  to: JMAPEmailAddress[] | null;
  cc: JMAPEmailAddress[] | null;
  bcc: JMAPEmailAddress[] | null;
  replyTo: JMAPEmailAddress[] | null;
  subject: string | null;
  sentAt: string | null;
  hasAttachment: boolean;
  preview: string;
  bodyValues?: Record<
    string,
    {
      value: string;
      isEncodingProblem: boolean;
      isTruncated: boolean;
    }
  >;
  textBody?: JMAPEmailBodyPart[];
  htmlBody?: JMAPEmailBodyPart[];
  attachments?: JMAPEmailAttachment[];
  headers?: JMAPEmailHeader[];
}

export interface JMAPEmailAddress {
  name: string | null;
  email: string;
}

export interface JMAPEmailBodyPart {
  partId: string;
  blobId: string;
  size: number;
  name: string | null;
  type: string;
  charset: string | null;
  disposition: string | null;
  cid: string | null;
  location: string | null;
}

export interface JMAPEmailAttachment {
  partId: string;
  blobId: string;
  size: number;
  name: string | null;
  type: string;
  charset: string | null;
  disposition: string | null;
  cid: string | null;
}

export interface JMAPEmailHeader {
  name: string;
  value: string;
}

export interface JMAPThread {
  id: string;
  emailIds: string[];
}

export interface JMAPMailbox {
  id: string;
  name: string;
  parentId: string | null;
  role: string | null;
  sortOrder: number;
  totalEmails: number;
  unreadEmails: number;
  totalThreads: number;
  unreadThreads: number;
  myRights: {
    mayReadItems: boolean;
    mayAddItems: boolean;
    mayRemoveItems: boolean;
    maySetSeen: boolean;
    maySetKeywords: boolean;
    mayCreateChild: boolean;
    mayRename: boolean;
    mayDelete: boolean;
    maySubmit: boolean;
  };
  isSubscribed: boolean;
}

export interface JMAPEmailSubmission {
  id?: string;
  identityId: string;
  emailId: string;
  threadId?: string;
  envelope: {
    mailFrom: {
      email: string;
      parameters: Record<string, string> | null;
    };
    rcptTo: Array<{
      email: string;
      parameters: Record<string, string> | null;
    }>;
  } | null;
  sendAt?: string;
  undoStatus: "pending" | "final" | "canceled";
}

export interface JMAPIdentity {
  id: string;
  name: string;
  email: string;
  replyTo: JMAPEmailAddress[] | null;
  bcc: JMAPEmailAddress[] | null;
  textSignature: string;
  htmlSignature: string;
  mayDelete: boolean;
}

export interface JMAPQueryResponse {
  accountId: string;
  queryState: string;
  canCalculateChanges: boolean;
  position: number;
  ids: string[];
  total?: number;
  limit?: number;
}

export interface JMAPGetResponse<T> {
  accountId: string;
  state: string;
  list: T[];
  notFound: string[];
}

export interface JMAPSetResponse {
  accountId: string;
  oldState: string;
  newState: string;
  created: Record<string, unknown> | null;
  updated: Record<string, unknown> | null;
  destroyed: string[] | null;
  notCreated: Record<string, JMAPError> | null;
  notUpdated: Record<string, JMAPError> | null;
  notDestroyed: Record<string, JMAPError> | null;
}
