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

export type CleanStats = {
  total: number;
  processing: number;
  applying: number;
  completed: number;
  archived: number;
  labels: Record<string, number>;
};
