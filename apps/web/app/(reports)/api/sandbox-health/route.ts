import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    message: "Sandbox API is working",
    timestamp: new Date().toISOString(),
  });
}

export async function POST() {
  return NextResponse.json({
    status: "ok",
    message: "Sandbox API POST is working",
    timestamp: new Date().toISOString(),
  });
}
