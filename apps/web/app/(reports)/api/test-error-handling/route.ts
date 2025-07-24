import { type NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const requestId = Math.random().toString(36).substring(7);
  const startTime = Date.now();

  console.log(`[${requestId}] Test error handling endpoint called`);

  try {
    // Simulate some processing
    await new Promise((resolve) => setTimeout(resolve, 1000));

    console.log(
      `[${requestId}] Test completed successfully in ${Date.now() - startTime}ms`,
    );

    return NextResponse.json({
      success: true,
      message: "Error handling test completed",
      requestId,
      processingTime: Date.now() - startTime,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    console.error(`[${requestId}] Test error:`, {
      error: errorMessage,
      processingTime: Date.now() - startTime,
    });

    return NextResponse.json(
      {
        error: "Test failed",
        details: errorMessage,
        requestId,
        processingTime: Date.now() - startTime,
      },
      { status: 500 },
    );
  }
}
