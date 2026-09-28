import { NextResponse } from "next/server";

export const UNSUBSCRIBE_ALLOWANCE_ERROR_CODE = "unsubscribe_allowance";

export function unsubscribeAllowanceErrorResponse() {
  return NextResponse.json(
    {
      error: "Unsubscribe allowance exceeded",
      errorCode: UNSUBSCRIBE_ALLOWANCE_ERROR_CODE,
      isKnownError: true,
    },
    { status: 403 },
  );
}
