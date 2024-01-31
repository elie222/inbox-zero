import { NextResponse } from "next/server";
import { withError } from "@/utils/middleware";

export const GET = withError(async (request) => {
  // this could be useful in cloudwatch or other logs to understand
  // if service workers are not getting installed on the browsers after first login.

  console.log(
    request,
    "Service worker not installed or activated in the browser",
  );
  return NextResponse.json(
    { message: "Service worker not installed or activated in the browser" },
    { status: 503 },
  );
});
