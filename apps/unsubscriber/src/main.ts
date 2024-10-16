import { chromium } from "playwright";
import type { Page, ElementHandle } from "playwright";
import { z } from "zod";
import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { env } from "./env";

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
  const maxContentLength = 20000; // Adjust based on API limitations
  let contentToAnalyze = pageContent;
  if (contentToAnalyze.length > maxContentLength) {
    console.warn(
      `Page content exceeds ${maxContentLength} characters. Truncating...`,
    );
    contentToAnalyze = contentToAnalyze.substring(0, maxContentLength);
  }

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

  let analysisText: string;
  try {
    const analysisPromise = generateText({
      model: google("gemini-1.5-flash"),
      prompt: prompt,
    });

    // Timeout if AI takes too long to respond
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("AI analysis timeout")), 30000),
    );

    const { text } = (await Promise.race([
      analysisPromise,
      timeoutPromise,
    ])) as { text: string };
    analysisText = text;
  } catch (error) {
    console.error("Error generating AI analysis:", error);
    throw new Error("Failed to generate AI analysis");
  }

  try {
    // Remove any markdown code block indicators
    const cleanedText = analysisText.replace(/```json\n?|\n?```/g, "").trim();
    const parsedAnalysis = JSON.parse(cleanedText);
    return pageAnalysisSchema.parse(parsedAnalysis);
  } catch (error) {
    console.error("Error parsing AI response:", error);
    console.error("Raw AI response:", analysisText);
    throw new Error("Failed to parse AI response");
  }
}

async function performUnsubscribeActions(
  page: Page,
  actions: PageAnalysis["actions"],
) {
  // Limit retries to 3 to avoid infinite loops
  const MAX_RETRIES = 3;

  for (const action of actions) {
    let retries = 0;
    while (retries < MAX_RETRIES) {
      try {
        console.log(`Attempting action: ${action.type} on ${action.selector}`);
        const locator = page.locator(action.selector);

        if ((await locator.count()) === 0) {
          console.warn(`Element not found: ${action.selector}`);
          break;
        }

        if (!(await locator.isVisible())) {
          console.warn(`Element not visible: ${action.selector}`);
          break;
        }

        switch (action.type) {
          case "click":
          case "submit":
            await locator.click({ timeout: 5000 });
            break;
          case "fill":
            if (action.value) {
              await locator.fill(action.value, { timeout: 5000 });
            }
            break;
          case "select":
            if (action.value) {
              await locator.selectOption(action.value, { timeout: 5000 });
            }
            break;
        }
        console.log(`Action completed: ${action.type} on ${action.selector}`);
        break; // Success, exit retry loop
      } catch (error) {
        console.warn(
          `Failed to perform action: ${action.type} on ${action.selector}. Retry ${retries + 1}/${MAX_RETRIES}. Error: ${error}`,
        );
        retries++;
        if (retries >= MAX_RETRIES) {
          console.error(
            `Max retries reached for action: ${action.type} on ${action.selector}`,
          );
        }
      }

      // Add delay between retries
      await page.waitForTimeout(1000);
    }

    // Add delay between actions to mimic human behavior
    await page.waitForTimeout(2000);
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
      const elements = await page.$$(selector);
      if (elements.length > 0) {
        // Filter visible elements
        const visibleElements = await Promise.all(
          elements.map(async (el) => ((await el.isVisible()) ? el : null)),
        );
        const element = visibleElements.find((el) => el !== null) as
          | ElementHandle<Element>
          | undefined;

        if (element) {
          await element.click({ timeout: 5000 });
          console.log(`Successfully clicked unsubscribe element: ${selector}`);
          return true;
        }
      }
    } catch (error) {
      console.warn(`Error trying to click ${selector}:`, error);
    }
  }

  console.log("No unsubscribe element found or clicked in fallback strategy");
  return false;
}

export async function autoUnsubscribe(url: string): Promise<boolean> {
  // Validate URL
  try {
    new URL(url);
  } catch (err) {
    console.error("Invalid URL provided:", url);
    return false;
  }

  const isProduction = env.NODE_ENV === "production";
  const browser = await chromium.launch({ headless: isProduction });
  const page = await browser.newPage();

  try {
    console.log(`Navigating to ${url}`);
    await page.goto(url, { timeout: 30000 });
    const initialContent = await page.content();

    const maxContentLength = 20000; // Adjust based on API limitations
    const truncatedContent =
      initialContent.length > maxContentLength
        ? initialContent.substring(0, maxContentLength)
        : initialContent;

    const analysis = await analyzePageWithAI(truncatedContent);
    console.log("AI analysis result:", JSON.stringify(analysis, null, 2));

    if (analysis.actions.length > 0) {
      await performUnsubscribeActions(page, analysis.actions);
    } else {
      console.log("No actions determined by AI. Attempting fallback strategy.");
      const fallbackSuccess = await performFallbackUnsubscribe(page);
      if (!fallbackSuccess) {
        console.log("Fallback strategy failed to find unsubscribe element.");
        return false;
      }
    }

    // Wait for any redirects or page loads to complete
    await page
      .waitForLoadState("networkidle", { timeout: 10000 })
      .catch((error) => {
        console.warn(
          "Error waiting for network idle state after actions:",
          error,
        );
      });

    // Check for confirmation
    const finalContent = await page.content();
    const confirmationFound = analysis.confirmationIndicator
      ? await page.$(analysis.confirmationIndicator).then(Boolean)
      : finalContent.toLowerCase().includes("unsubscribed") ||
        finalContent.toLowerCase().includes("successfully");

    if (confirmationFound) {
      console.log("Unsubscribe confirmation found.");
      return true;
    }

    console.log("Unsubscribe action performed, but confirmation not found.");
    // Only take screenshot if not in production
    if (!isProduction) {
      await page.screenshot({
        path: "final-state-screenshot.png",
        fullPage: true,
      });
    }
    return false;
  } catch (error) {
    console.error("Error during unsubscribe process:", error);
    // Only take screenshot if not in production
    if (!isProduction) {
      await page.screenshot({ path: "error-screenshot.png", fullPage: true });
    }
    return false;
  } finally {
    await browser.close();
  }
}
