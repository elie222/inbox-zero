export { WebhookPayload } from "@/utils/webhook";

/**
 * Example webhook handler for Node.js/Express
 * 
 * @example
 * ```typescript
 * import type { WebhookPayload } from "@/types/webhook";
 * import express from "express";
 * 
 * app.post('/webhook', express.json(), (req: express.Request<{}, {}, WebhookPayload>, res) => {
 *   const webhookSecret = req.headers['x-webhook-secret'];
 *   
 *   if (webhookSecret !== process.env.EXPECTED_WEBHOOK_SECRET) {
 *     return res.status(401).json({ error: 'Unauthorized' });
 *   }
 *   
 *   const { email, executedRule } = req.body;
 *   
 *   // Your webhook logic here
 *   console.log('Email processed:', {
 *     subject: email.subject,
 *     from: email.from,
 *     ruleReason: executedRule.reason
 *   });
 *   
 *   res.status(200).json({ success: true });
 * });
 * ```
 */

/**
 * Webhook request headers
 */
export interface WebhookHeaders {
  "content-type": "application/json";
  "x-webhook-secret": string;
}

/**
 * Complete webhook request interface for type safety
 */
export interface WebhookRequest {
  method: "POST";
  headers: WebhookHeaders;
  body: WebhookPayload;
}

/**
 * Expected webhook response interface
 */
export interface WebhookResponse {
  success: boolean;
  error?: string;
  data?: any;
}