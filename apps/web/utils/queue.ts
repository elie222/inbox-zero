import Queue from "bull";

const apiRequestQueue = new Queue("openai-requests", {
  redis: {
    host: process.env.UPSTASH_REDIS_URL,
  },
});

export async function addRequestToQueue(requestData: any) {
  await apiRequestQueue.add("api-request", requestData);
  // Logic to acknowledge the request has been queued
}
