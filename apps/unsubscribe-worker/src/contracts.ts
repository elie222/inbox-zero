import { z } from "zod";

export const MAX_JOB_MS = 120_000;
export const MAX_STEPS = 12;

export const jobSchema = z.object({
  jobId: z.uuid(),
  url: z
    .url()
    .max(8192)
    .refine((value) => {
      const url = new URL(value);
      return (
        url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        (!url.port || url.port === "443")
      );
    }),
  recipientEmail: z.email().max(320),
});

export const resultSchema = z.object({
  status: z.enum(["confirmed", "needs_user", "failed"]),
});

export const decisionSchema = z.object({
  action: z.enum(["click", "fill_email", "select", "confirmed", "needs_user"]),
  ref: z.number().int().min(0).max(199).nullable(),
  option: z.string().max(300).nullable(),
});

export const observationSchema = z.object({
  text: z.string().max(16_000),
  controls: z
    .array(
      z.object({
        ref: z.number().int().min(0).max(199),
        tag: z.string().max(20),
        type: z.string().max(30),
        label: z.string().max(400),
        options: z.array(z.string().max(300)).max(100),
      }),
    )
    .max(200),
});

export type Job = z.infer<typeof jobSchema>;
export type Result = z.infer<typeof resultSchema>;
export type Observation = z.infer<typeof observationSchema>;
export type Decision = z.infer<typeof decisionSchema>;

export type SandboxInput = Job & {
  brokerUrl: string;
  brokerIp: string;
  token: string;
};

// Implementations must create a fresh isolated instance, restrict egress to the
// broker address (with only the broker port exposed), and arrange host/provider expiry independently of this process.
export interface SandboxAdapter {
  create(options: {
    jobId: string;
    brokerIp: string;
    brokerPort: number;
    signal: AbortSignal;
  }): Promise<{
    run(input: SandboxInput, signal: AbortSignal): Promise<Result>;
    destroy(): Promise<void>;
  }>;
}
