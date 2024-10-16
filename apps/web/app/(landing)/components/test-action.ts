"use server";

export async function testAction() {
  console.log("testAction started");

  // sleep for 5 seconds
  await new Promise((resolve) => setTimeout(resolve, 5_000));

  console.log("testAction completed");

  return "Action completed";
}
