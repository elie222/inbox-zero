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

const notificationSchema = z.object({
  subscriptionId: z.string(),
  changeType: z.string(),
  resource: z.string().nullish(),
  resourceData: resourceDataSchema,
  subscriptionExpirationDateTime: z.string().nullish(),
  clientState: z.string().nullish(),
  tenantId: z.string().nullish(),
});

export const webhookBodySchema = z.object({
  value: z.array(notificationSchema),
});

export type OutlookResourceData = z.infer<typeof resourceDataSchema>;
