import { Plan } from "@/utils/plan";

type PlanWithThread = Plan & { threadId: string };

export type FilterFunction = (plan?: PlanWithThread, args?: FilterArgs) => boolean;
export type FilterArgs = any;
export type Filters = 'label' | 'to_respond' | 'by_id';

export const filters: Filters[] = ['label', 'to_respond', 'by_id'];

export const label: FilterFunction = (plan?: PlanWithThread, args?: { label: string }) => {
  return plan?.label === args?.label;
}

export const to_respond: FilterFunction = (plan?: PlanWithThread) => {
  return plan?.action === 'respond';
}

export const by_id: FilterFunction = (plan?: PlanWithThread, args?: { ids: string }) => {
  return !!(plan?.threadId && args?.ids.includes(plan?.threadId))
}

export const getFilterFunction = (filter: Filters): FilterFunction => {
  switch (filter) {
    case 'label':
      return label;
    case 'to_respond':
      return to_respond;
    case 'by_id':
      return by_id;
    default:
      throw new Error(`Unknown filter: ${filter}`);
  }
}