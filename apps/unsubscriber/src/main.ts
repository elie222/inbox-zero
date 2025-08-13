/** biome-ignore-all lint/suspicious/noConsole: not used in production yet */
import { chromium } from "playwright";
import type { Page, Locator } from "playwright";
import { z } from "zod";
import { generateText } from "ai";
import { env } from "./env";
import { getModel } from "./llm";

const MAX_CONTENT_LENGTH = 20_000; // Adjust based on API limitations
const AI_TIMEOUT = 30_000;

const NETWORK_IDLE_TIMEOUT = 10_000;
const MAX_RETRIES = 3; // Limit retries to 3 to avoid infinite loops
const RETRY_DELAY = 1000; // Delay between retries in milliseconds
const ACTION_TIMEOUT = 5000; // Timeout for each action in milliseconds
const ACTION_DELAY = 2000; // Delay between actions in milliseconds

const pageAnalysisSchema = z.object({
  actions: z.array(
    z.object({
      type: z.enum(["click", "fill", "select", "submit"]),
      selector: z.string(),
      value: z.string().optional(),
    }),
  ),
  confirmationIndicator: z.string().nullable(),
});

type PageAnalysis = z.infer<typeof pageAnalysisSchema>;

async function analyzePageWithAI(pageContent: string): Promise<PageAnalysis> {
  const contentToAnalyze = pageContent.slice(0, MAX_CONTENT_LENGTH);
  if (contentToAnalyze.length < pageContent.length) {
    console.warn(
      `Page content exceeds ${MAX_CONTENT_LENGTH} characters. Truncated.`,
    );
  }

  const model = getModel("google");

  const prompt = `
    Analyze the following HTML content and determine the actions needed to unsubscribe from an email newsletter.
    Provide a JSON object with:
    1. An 'actions' array containing steps to unsubscribe. Each action should have:
       - 'type': Either 'click', 'fill', 'select', or 'submit'
       - 'selector': A CSS selector for the element. Use only standard CSS selectors (e.g., '#id', '.class', 'tag', '[attribute]').
       - 'value': (Optional) For input fields. Omit this field if not applicable.
    2. A 'confirmationIndicator' string to verify success. This should be a CSS selector for an element that appears after successful unsubscription. If uncertain, set to null.

    Return ONLY the JSON object, without any markdown formatting, code blocks, or explanation.

    HTML Content:
    ${contentToAnalyze}
  `;

  try {
    const { text: analysisText } = await Promise.race([
      generateText({ model, prompt }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("AI analysis timeout")), AI_TIMEOUT),
      ),
    ]);

    const cleanedText = analysisText.replace(/```json\n?|\n?```/g, "").trim();
    const parsedAnalysis = JSON.parse(cleanedText);
    return pageAnalysisSchema.parse(parsedAnalysis);
  } catch (error) {
    console.error("Error in AI analysis:", error);
    console.error(
      "Raw AI response:",
      error instanceof Error ? error.message : String(error),
    );
    throw new Error("Failed to generate or parse AI analysis");
  }
}

async function performUnsubscribeActions(
  page: Page,
  actions: PageAnalysis["actions"],
) {
  for (const action of actions) {
    let retries = 0;
    while (retries < MAX_RETRIES) {
      try {
        console.log(`Attempting action: ${action.type} on ${action.selector}`);
        const locator = page.locator(action.selector);

        const [elementCount, isVisible] = await Promise.all([
          locator.count(),
          locator.isVisible(),
        ]);

        if (elementCount === 0) {
          console.warn(`Element not found: ${action.selector}`);
          break;
        }

        if (!isVisible) {
          console.warn(`Element not visible: ${action.selector}`);
          break;
        }

        await performAction(locator, action);
        console.log(`Action completed: ${action.type} on ${action.selector}`);
        break; // Success, exit retry loop
      } catch (error) {
        console.warn(
          `Failed to perform action: ${action.type} on ${action.selector}. Retry ${
            retries + 1
          }/${MAX_RETRIES}. Error: ${error instanceof Error ? error.message : String(error)}`,
        );
        retries++;
        if (retries >= MAX_RETRIES) {
          console.error(
            `Max retries reached for action: ${action.type} on ${action.selector}`,
          );
        } else {
          await page.waitForTimeout(RETRY_DELAY);
        }
      }
    }

    // Add delay between actions to mimic human behavior
    await page.waitForTimeout(ACTION_DELAY);
  }
}

async function performAction(
  locator: Locator,
  action: PageAnalysis["actions"][number],
) {
  switch (action.type) {
    case "click":
    case "submit":
      await locator.click({ timeout: ACTION_TIMEOUT });
      break;
    case "fill":
      if (action.value) {
        await locator.fill(action.value, { timeout: ACTION_TIMEOUT });
      }
      break;
    case "select":
      if (action.value) {
        await locator.selectOption(action.value, { timeout: ACTION_TIMEOUT });
      }
      break;
    default:
      throw new Error(`Unsupported action type: ${action.type}`);
  }
}

async function performFallbackUnsubscribe(page: Page): Promise<boolean> {
  const unsubscribeKeywords = [
    "unsubscribe", // English
    "désabonner", // French
    "abbestellen", // German
    "cancelar suscripción", // Spanish
    "annulla iscrizione", // Italian
    "退订", // Chinese (Simplified)
    "退訂", // Chinese (Traditional)
    "退会", // Japanese
    "отписаться", // Russian
    "se désabonner", // Alternative French
    "désinscription", // Another French alternative
    "abmelden", // Alternative German
    "darse de baja", // Alternative Spanish
  ];

  const generateSelectors = (keyword: string) => [
    `button:has-text("${keyword}")`,
    `a:has-text("${keyword}")`,
    `input[type="submit"][value*="${keyword}" i]`,
    `:text("${keyword}")`,
    `[aria-label*="${keyword}" i]`,
    `[title*="${keyword}" i]`,
  ];

  const allSelectors = unsubscribeKeywords.flatMap(generateSelectors);

  for (const selector of allSelectors) {
    try {
      const locator = page.locator(selector);
      const count = await locator.count();

      if (count > 0) {
        const visibleLocator = locator.filter({ hasText: /./ }).first();
        const isVisible = await visibleLocator.isVisible();

        if (isVisible) {
          await visibleLocator.click({ timeout: ACTION_TIMEOUT });
          console.log(`Successfully clicked unsubscribe element: ${selector}`);
          return true;
        }
      }
    } catch (error) {
      console.warn(
        `Error trying to click ${selector}:`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  console.log("No unsubscribe element found or clicked in fallback strategy");
  return false;
}

export async function autoUnsubscribe(url: string): Promise<boolean> {
  if (!isValidUrl(url)) {
    console.error("Invalid URL provided:", url);
    return false;
  }

  const isProduction = env.NODE_ENV === "production";
  const browser = await chromium.launch({ headless: isProduction });
  const page = await browser.newPage();

  try {
    console.log(`Navigating to ${url}`);
    await page.goto(url, { timeout: 30_000, waitUntil: "networkidle" });

    const initialContent = await page.content();
    const truncatedContent = initialContent.slice(0, MAX_CONTENT_LENGTH);

    const analysis = await analyzePageWithAI(truncatedContent);
    console.log("AI analysis result:", JSON.stringify(analysis, null, 2));

    let unsubscribeSuccess = false;
    if (analysis.actions.length > 0) {
      await performUnsubscribeActions(page, analysis.actions);
      unsubscribeSuccess = true;
    } else {
      console.log("No actions determined by AI. Attempting fallback strategy.");
      unsubscribeSuccess = await performFallbackUnsubscribe(page);
    }

    if (!unsubscribeSuccess) {
      console.log("Failed to perform unsubscribe action.");
      return false;
    }

    await waitForNetworkIdle(page);

    const confirmationFound = await checkConfirmation(
      page,
      analysis.confirmationIndicator,
    );

    if (confirmationFound) {
      console.log("Unsubscribe confirmation found.");
      return true;
    }

    console.log("Unsubscribe action performed, but confirmation not found.");
    await takeScreenshotIfNotProduction(
      page,
      isProduction,
      "final-state-screenshot.png",
    );
    return false;
  } catch (error) {
    console.error("Error during unsubscribe process:", error);
    await takeScreenshotIfNotProduction(
      page,
      isProduction,
      "error-screenshot.png",
    );
    return false;
  } finally {
    await browser.close();
  }
}

function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

async function waitForNetworkIdle(page: Page) {
  try {
    await page.waitForLoadState("networkidle", {
      timeout: NETWORK_IDLE_TIMEOUT,
    });
  } catch (error) {
    console.warn("Error waiting for network idle state after actions:", error);
  }
}

async function checkConfirmation(
  page: Page,
  confirmationIndicator: string | null,
): Promise<boolean> {
  if (confirmationIndicator)
    return page.locator(confirmationIndicator).isVisible();

  const finalContent = await page.content();
  const lowercaseContent = finalContent.toLowerCase();
  return (
    lowercaseContent.includes("unsubscribed") ||
    lowercaseContent.includes("successfully")
  );
}

async function takeScreenshotIfNotProduction(
  page: Page,
  isProduction: boolean,
  filename: string,
) {
  if (!isProduction) await page.screenshot({ path: filename, fullPage: true });
}
