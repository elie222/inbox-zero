// A long running service that consumes requests from a queue and passes them to our Next.js endpoints to be handled.
// This helps us avoid being rate limited by the OpenAI API.

import Queue from 'bull';

console.log("Started process queue")

const apiRequestQueue = new Queue("openai-requests", {
  redis: {
    host: process.env.UPSTASH_REDIS_URL,
  },
});

apiRequestQueue.process(async (job) => {
  const requestData = job.data;
  console.log("🚀 ~ file: process-queue.ts:8 ~ apiRequestQueue.process ~ requestData:", requestData)
  // Logic to make the API call and handle the response
});
