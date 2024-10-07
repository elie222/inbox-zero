import { chromium, Page } from "playwright";
import { z } from "zod";
import { generateText } from "ai";
import { google } from "@ai-sdk/google";

import dotenv from "dotenv";

dotenv.config();

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
    ${pageContent}
  `;

  const { text: analysisText } = await generateText({
    model: google("gemini-1.5-flash"),
    prompt: prompt,
  });

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
  for (const action of actions) {
    console.log(`Attempting action: ${action.type} on ${action.selector}`);
    try {
      const locator = page.locator(action.selector);

      if ((await locator.count()) === 0) {
        console.warn(`Element not found: ${action.selector}`);
        continue;
      }

      if (!(await locator.isVisible())) {
        console.warn(`Element not visible: ${action.selector}`);
        continue;
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
    } catch (error) {
      console.warn(
        `Failed to perform action: ${action.type} on ${action.selector}. Error: ${error}`,
      );
    }
    await page
      .waitForLoadState("networkidle", { timeout: 5000 })
      .catch(() => {});
  }
}

export async function autoUnsubscribe(url: string): Promise<boolean> {
  // Remove headless: false if you don't want the browser popup to open
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  try {
    console.log(`Navigating to ${url}`);
    await page.goto(url, { timeout: 30000 });
    const initialContent = await page.content();

    const analysis = await analyzePageWithAI(initialContent);
    console.log("AI analysis result:", JSON.stringify(analysis, null, 2));

    if (analysis.actions.length > 0) {
      await performUnsubscribeActions(page, analysis.actions);
    } else {
      console.log("No actions determined by AI. Attempting fallback strategy.");
      await performFallbackUnsubscribe(page);
    }

    await page
      .waitForLoadState("networkidle", { timeout: 5000 })
      .catch(() => {});

    const finalContent = await page.content();
    const contentChanged = initialContent !== finalContent;

    const confirmationText = await page.evaluate(() => {
      const body = document.body.innerText.toLowerCase();
      return (
        body.includes("unsubscribed") ||
        body.includes("successfully") ||
        body.includes("confirmed")
      );
    });

    if (confirmationText || contentChanged) {
      console.log("Unsubscribe likely successful");
      return true;
    } else {
      console.log("Unsubscribe may have failed");
      await page.screenshot({
        path: "final-state-screenshot.png",
        fullPage: true,
      });
      return false;
    }
  } catch (error) {
    console.error("Error during unsubscribe process:", error);
    // Optional
    await page.screenshot({ path: "error-screenshot.png", fullPage: true });
    return false;
  } finally {
    await browser.close();
  }
}

async function performFallbackUnsubscribe(page: Page) {
  const unsubscribeSelectors = [
    "button:has-text(/unsubscribe/i)",
    "a:has-text(/unsubscribe/i)",
    'input[type="submit"][value*="unsubscribe" i]',
    ':text("unsubscribe")',
  ];

  for (const selector of unsubscribeSelectors) {
    const element = page.locator(selector);
    if ((await element.count()) > 0) {
      await element.click({ timeout: 5000 }).catch(console.warn);
      console.log(`Clicked element: ${selector}`);
      return;
    }
  }
  console.log("No unsubscribe element found in fallback strategy");
}
