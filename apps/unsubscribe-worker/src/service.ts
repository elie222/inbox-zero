import { randomBytes } from "node:crypto";
import type { Socket } from "node:net";
import {
  MAX_JOB_MS,
  MAX_STEPS,
  SandboxCleanupUnconfirmed,
  resultSchema,
  type Decision,
  type Job,
  type Observation,
  type Result,
  type SandboxAdapter,
} from "./contracts.ts";

type Session = {
  controller: AbortController;
  expiresAt: number;
  history: Decision[];
  inFlight: boolean;
  sockets: Set<Socket>;
  connections: number;
  bytes: number;
};

export class UnsubscribeService {
  private readonly sessions = new Map<string, Session>();
  private readonly jobs = new Set<string>();
  private healthy = true;
  private readonly options: {
    adapter: SandboxAdapter;
    brokerUrl: string;
    brokerIp: string;
    maxConcurrent: number;
    decide: (
      observation: Observation,
      history: Decision[],
      signal: AbortSignal,
    ) => Promise<Decision>;
  };

  constructor(options: UnsubscribeService["options"]) {
    this.options = options;
  }

  async execute(job: Job, clientSignal?: AbortSignal): Promise<Result> {
    if (
      !this.healthy ||
      this.jobs.size >= this.options.maxConcurrent ||
      this.jobs.has(job.jobId)
    )
      throw new Error("Worker unavailable");
    this.jobs.add(job.jobId);
    const token = randomBytes(32).toString("hex");
    const session: Session = {
      controller: new AbortController(),
      expiresAt: Date.now() + MAX_JOB_MS,
      history: [],
      inFlight: false,
      sockets: new Set(),
      connections: 0,
      bytes: 0,
    };
    this.sessions.set(token, session);
    session.controller.signal.addEventListener(
      "abort",
      () => {
        for (const socket of session.sockets) socket.destroy();
      },
      { once: true },
    );
    const abort = () => session.controller.abort();
    clientSignal?.addEventListener("abort", abort, { once: true });
    if (clientSignal?.aborted) abort();
    const timeout = setTimeout(abort, MAX_JOB_MS);
    const { adapter, brokerUrl, brokerIp } = this.options;
    let sandbox: Awaited<ReturnType<SandboxAdapter["create"]>> | undefined;
    let result: Result = { status: "failed" };
    try {
      session.controller.signal.throwIfAborted();
      const createdSandbox = await abortable(
        adapter
          .create({
            jobId: job.jobId,
            brokerIp,
            brokerPort: Number(new URL(brokerUrl).port || 443),
            signal: session.controller.signal,
          })
          .then(async (created) => {
            if (session.controller.signal.aborted) {
              try {
                await created.destroy();
              } catch {
                throw new SandboxCleanupUnconfirmed();
              }
              throw new Error("Job expired during creation");
            }
            return created;
          }),
        session.controller.signal,
      );
      sandbox = createdSandbox;
      session.controller.signal.throwIfAborted();
      result = resultSchema.parse(
        await abortable(
          createdSandbox.run(
            { ...job, brokerUrl, brokerIp, token },
            session.controller.signal,
          ),
          session.controller.signal,
        ),
      );
      session.controller.signal.throwIfAborted();
      if (
        result.status === "confirmed" &&
        session.history.at(-1)?.action !== "confirmed"
      )
        result = { status: "failed" };
    } catch (error) {
      // Provider errors can contain command output, URLs and other job data.
      result = { status: "failed" };
      if (error instanceof SandboxCleanupUnconfirmed) this.healthy = false;
    } finally {
      this.sessions.delete(token);
      abort();
      for (const socket of session.sockets) socket.destroy();
      clearTimeout(timeout);
      clientSignal?.removeEventListener("abort", abort);
      try {
        if (sandbox)
          await abortable(sandbox.destroy(), AbortSignal.timeout(30_000));
      } catch {
        this.healthy = false;
        result = { status: "failed" };
      }
      this.jobs.delete(job.jobId);
    }
    return result;
  }

  authorize(token: string): Session {
    const session = this.sessions.get(token);
    if (
      !session ||
      session.controller.signal.aborted ||
      session.expiresAt <= Date.now()
    )
      throw new Error("Unauthorized");
    return session;
  }

  async decision(token: string, observation: Observation) {
    const session = this.authorize(token);
    if (
      session.inFlight ||
      session.history.length >= MAX_STEPS ||
      ["confirmed", "needs_user"].includes(session.history.at(-1)?.action ?? "")
    )
      throw new Error("Decision limit reached");
    session.inFlight = true;
    try {
      const decision = await this.options.decide(
        observation,
        session.history,
        session.controller.signal,
      );
      this.authorize(token);
      session.history.push(decision);
      return decision;
    } finally {
      session.inFlight = false;
    }
  }

  shutdown() {
    this.healthy = false;
    for (const session of this.sessions.values()) {
      session.controller.abort();
      for (const socket of session.sockets) socket.destroy();
    }
  }
}

async function abortable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  let abort = () => {};
  const cancelled = new Promise<never>((_resolve, reject) => {
    abort = () => reject(new Error("Operation expired"));
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
  try {
    return await Promise.race([work, cancelled]);
  } finally {
    signal.removeEventListener("abort", abort);
  }
}
