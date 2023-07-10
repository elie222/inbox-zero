import { ZodError } from "zod";
import { NextResponse } from "next/server";
import { captureException } from "@/utils/error";

export type NextHandler = (req: Request) => Promise<unknown>;

export function withError(handler: NextHandler): NextHandler {
  return async (req: Request) => {
    try {
      return await handler(req);
    } catch (error) {
      if (error instanceof ZodError) {
        if (process.env.LOG_ZOD_ERRORS) {
          console.error(`Error for url: ${req.url}:`);
          console.error(error);
        }
        return NextResponse.json(
          { erro: { issues: error.issues } },
          { status: 400 }
        );
      }
      captureException(error);
      console.error(`Error for url: ${req.url}:`);
      console.error(error);
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
  };
}
