import { publicApiErrorResponse } from "@/utils/public-api-error";

function notFound() {
  return publicApiErrorResponse({
    status: 404,
    code: "NOT_FOUND",
    message: "API route not found",
  });
}

export function GET() {
  return notFound();
}

export function POST() {
  return notFound();
}

export function PUT() {
  return notFound();
}

export function PATCH() {
  return notFound();
}

export function DELETE() {
  return notFound();
}
