/**
 * Receipt Processor Capability Example
 *
 * Demonstrates a capability that:
 * - Identifies purchase receipts and order confirmations
 * - Extracts structured purchase data for expense tracking
 * - Labels and organizes receipt emails
 * - Stores receipt data for later retrieval
 *
 * Required capabilities: email:classify, email:modify
 */
import { z } from "zod";
import { defineCapability } from "../helpers/define-capability";
import type { CapabilityContext, CapabilityResult } from "../types/capability";

/**
 * Schema for extracted receipt data
 */
const receiptDataSchema = z.object({
  isReceipt: z
    .boolean()
    .describe("Whether this email is a receipt or order confirmation"),
  merchant: z.string().optional().describe("Store or merchant name"),
  orderNumber: z.string().optional().describe("Order or transaction ID"),
  total: z
    .number()
    .optional()
    .describe("Total amount in the receipt's currency"),
  currency: z
    .string()
    .optional()
    .describe("Three-letter currency code (USD, EUR, etc.)"),
  date: z.string().optional().describe("Purchase date in ISO format"),
  category: z
    .enum([
      "shopping",
      "food-delivery",
      "travel",
      "subscription",
      "software",
      "entertainment",
      "utilities",
      "other",
    ])
    .optional()
    .describe("Expense category"),
  items: z
    .array(
      z.object({
        name: z.string(),
        quantity: z.number().optional(),
        price: z.number().optional(),
      }),
    )
    .optional()
    .describe("Line items in the receipt"),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("Confidence in this extraction"),
});

type ReceiptData = z.infer<typeof receiptDataSchema>;

/**
 * Receipt Processor Capability
 *
 * Processes purchase receipts and order confirmations by:
 * 1. Detecting receipt-like emails
 * 2. Extracting structured purchase data
 * 3. Labeling and categorizing for expense tracking
 * 4. Storing data for later reporting
 *
 * @example plugin.json capabilities
 * ```json
 * {
 *   "capabilities": ["email:classify", "email:modify"]
 * }
 * ```
 */
export const receiptProcessor = defineCapability({
  id: "receipt-processor",
  name: "Receipt Processor",
  description:
    "Identifies purchase receipts and order confirmations, extracts purchase details, " +
    "and organizes them for expense tracking. Handles orders from Amazon, stores, restaurants, and services.",

  routingHints: [
    // receipt terms
    "receipt",
    "order confirmation",
    "purchase",
    "invoice",
    "payment received",
    "transaction",
    // commerce terms
    "order #",
    "order number",
    "total:",
    "subtotal",
    "amount charged",
    // common senders
    "noreply",
    "orders@",
    "receipts@",
    "billing@",
    // delivery terms
    "shipped",
    "delivery",
    "tracking",
    // subscription terms
    "subscription",
    "renewal",
    "monthly charge",
  ],

  /**
   * Quick check for receipt-like email patterns
   */
  async canHandle(ctx: CapabilityContext): Promise<boolean> {
    const { subject, from, snippet } = ctx.email;
    const text = `${subject} ${from} ${snippet}`.toLowerCase();

    // common receipt sender patterns
    const senderPatterns = [
      "noreply",
      "orders@",
      "receipt",
      "billing",
      "invoice",
    ];
    const hasSenderPattern = senderPatterns.some((p) =>
      from.toLowerCase().includes(p),
    );

    // common receipt content patterns
    const contentPatterns = [
      "order",
      "receipt",
      "invoice",
      "purchase",
      "payment",
      "confirmation",
      "total",
      "amount",
    ];
    const hasContentPattern = contentPatterns.some((p) => text.includes(p));

    return hasSenderPattern || hasContentPattern;
  },

  /**
   * Extract receipt data and organize the email
   */
  async execute(ctx: CapabilityContext): Promise<CapabilityResult> {
    const { email, llm, storage, emailOperations } = ctx;

    // extract receipt data using LLM
    const extraction = await llm.generateObject({
      schema: receiptDataSchema,
      prompt: `Analyze this email and extract receipt/purchase information if present.

Subject: ${email.subject}
From: ${email.from}
Content: ${email.body || email.snippet}

Extract all available purchase details. Be thorough with line items if they're visible.
If this is not a receipt or order confirmation, set isReceipt to false.`,
      system:
        "You are an expert at identifying purchase receipts and extracting transaction details. " +
        "Look for order numbers, totals, item lists, and merchant information. " +
        "Categorize purchases appropriately for expense tracking.",
    });

    const data: ReceiptData = extraction.object;

    // not a receipt
    if (!data.isReceipt) {
      return {
        handled: false,
        explanation: {
          summary: "Not a receipt",
          details:
            "Email does not appear to be a purchase receipt or order confirmation.",
        },
        confidence: data.confidence,
      };
    }

    const actions: CapabilityResult["actions"] = [];

    // store receipt data for later retrieval
    if (data.merchant && data.total) {
      const receiptKey = `receipt-${email.id}`;
      await storage.set(receiptKey, {
        emailId: email.id,
        threadId: email.threadId,
        merchant: data.merchant,
        orderNumber: data.orderNumber,
        total: data.total,
        currency: data.currency,
        date: data.date || new Date().toISOString(),
        category: data.category,
        items: data.items,
        extractedAt: new Date().toISOString(),
      });

      actions.push({
        type: "custom",
        params: { action: "stored-receipt", key: receiptKey },
        executed: true,
      });
    }

    // apply labels if email operations available
    if (emailOperations && email.threadId) {
      try {
        // main receipt label
        await emailOperations.applyLabel(email.threadId, "Receipts");
        actions.push({
          type: "label",
          params: { labelName: "Receipts", threadId: email.threadId },
          executed: true,
        });

        // category-specific label if available
        if (data.category) {
          const categoryLabel = `Receipts/${data.category}`;
          await emailOperations.applyLabel(email.threadId, categoryLabel);
          actions.push({
            type: "label",
            params: { labelName: categoryLabel, threadId: email.threadId },
            executed: true,
          });
        }
      } catch (error) {
        actions.push({
          type: "label",
          params: { labelName: "Receipts" },
          executed: false,
          error: String(error),
        });
      }
    }

    // build summary
    const summary = data.merchant
      ? `Receipt from ${data.merchant}: ${data.currency || "$"}${data.total?.toFixed(2) || "?"}`
      : "Receipt detected";

    const details = [
      data.orderNumber ? `Order #${data.orderNumber}` : null,
      data.date ? `Date: ${new Date(data.date).toLocaleDateString()}` : null,
      data.category ? `Category: ${data.category}` : null,
      data.items?.length ? `${data.items.length} item(s)` : null,
    ]
      .filter(Boolean)
      .join(" | ");

    return {
      handled: true,
      actions,
      explanation: {
        summary,
        details: details || undefined,
      },
      confidence: data.confidence,
    };
  },
});

export default receiptProcessor;
