import type {
  ScheduledAction,
  ScheduledActionStatus,
  ActionType,
} from "@prisma/client";

export interface ScheduledActionWithDetails extends ScheduledAction {
  emailAccount: {
    id: string;
    email: string;
    name: string | null;
  };
  executedRule: {
    rule: {
      id: string;
      name: string;
    } | null;
  } | null;
}
