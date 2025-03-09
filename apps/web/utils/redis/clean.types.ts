export type CleanThread = {
  threadId: string;
  userId: string;
  status: "processing" | "applying" | "completed";
  createdAt: string;
  from: string;
  subject: string;
  snippet: string;
  date: Date;

  archive?: boolean;
  label?: string;
};
