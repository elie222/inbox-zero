import { ActionType, type LogicalOperator } from "@/generated/prisma/enums";
import type { ZodCondition } from "@/utils/actions/rule.validation";

export type OrgActionFormValue = {
  type: ActionType;
  label: string;
  subject: string;
  content: string;
  to: string;
  cc: string;
  bcc: string;
  url: string;
  folderName: string;
  delayInMinutes: number | null;
};

export type OrgRuleFormValues = {
  name: string;
  conditions: ZodCondition[];
  conditionalOperator: LogicalOperator;
  runOnThreads: boolean;
  actions: OrgActionFormValue[];
};

export const EMPTY_ORG_ACTION: OrgActionFormValue = {
  type: ActionType.LABEL,
  label: "",
  subject: "",
  content: "",
  to: "",
  cc: "",
  bcc: "",
  url: "",
  folderName: "",
  delayInMinutes: null,
};
