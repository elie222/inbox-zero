export type DemoInboxFixture = {
  id: string;
  name: string;
  description: string;
  mailbox: DemoInboxMailbox;
  labels: DemoInboxLabel[];
  threads: DemoInboxThread[];
};

export type DemoInboxMailbox = {
  email: string;
  displayName: string;
  timezone: string;
};

export type DemoInboxLabel = {
  id: string;
  name: string;
  type: "system" | "user";
};

export type DemoInboxThread = {
  id: string;
  messages: DemoInboxMessage[];
};

export type DemoInboxMessage = {
  id: string;
  from: DemoInboxAddress;
  to: DemoInboxAddress[];
  cc?: DemoInboxAddress[];
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  date: string;
  unread?: boolean;
  labels?: string[];
};

export type DemoInboxAddress = {
  name?: string;
  email: string;
};
