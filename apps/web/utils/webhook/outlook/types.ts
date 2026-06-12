import { z } from "zod";

// https://learn.microsoft.com/en-us/graph/api/resources/resourcedata?view=graph-rest-1.0
const resourceDataSchema = z
  .object({
    "@odata.type": z.string().optional(),
    "@odata.id": z.string().optional(),
    "@odata.etag": z.string().optional(),
    id: z.string(), // The message identifier
  })
  .passthrough(); // Allow additional properties from other notification types

const notificationBaseSchema = z.object({
  subscriptionId: z.string(),
  clientState: z.string().nullish(),
  resource: z.string().nullish(),
  subscriptionExpirationDateTime: z.string().nullish(),
  tenantId: z.string().nullish(),
});

const changeNotificationSchema = notificationBaseSchema.extend({
  changeType: z.string(),
  resourceData: resourceDataSchema,
  lifecycleEvent: z.undefined().optional(),
});

const lifecycleNotificationSchema = notificationBaseSchema.extend({
  changeType: z.string().optional(),
  resourceData: resourceDataSchema.nullish(),
  lifecycleEvent: z.enum([
    "subscriptionRemoved",
    "missed",
    "reauthorizationRequired",
  ]),
});

export const webhookBodySchema = z.object({
  value: z.array(
    z.union([changeNotificationSchema, lifecycleNotificationSchema]),
  ),
});

export type OutlookResourceData = z.infer<typeof resourceDataSchema>;
export type OutlookWebhookNotification = z.infer<
  typeof webhookBodySchema
>["value"][number];
