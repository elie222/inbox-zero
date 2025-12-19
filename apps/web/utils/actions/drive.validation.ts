import { z } from "zod";

export const disconnectDriveBody = z.object({
  connectionId: z.string(),
});
export type DisconnectDriveBody = z.infer<typeof disconnectDriveBody>;
