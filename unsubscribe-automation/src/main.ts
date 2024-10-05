import { chromium, Page } from "playwright";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";

// TODO: Get API key from env
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || "");

const PageAnalysisSchema = z.object({
  actions: z.array(
    z.object({
      type: z.enum(["click", "fill", "select", "submit"]),
      selector: z.string(),
      value: z.string().optional(),
    }),
  ),
  confirmationIndicator: z.string().nullable(),
});

type PageAnalysis = z.infer<typeof PageAnalysisSchema>;

async function analyzePageWithAI(pageContent: string): Promise<PageAnalysis> {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

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

  const result = await model.generateContent(prompt);
  const response = result.response;
  let analysisText = response.text().trim();

  try {
    // Remove any markdown code block indicators
    analysisText = analysisText.replace(/```json\n?|\n?```/g, "");

    // Trim any leading or trailing whitespace
    analysisText = analysisText.trim();

    const parsedAnalysis = JSON.parse(analysisText);
    return PageAnalysisSchema.parse(parsedAnalysis);
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

async function autoUnsubscribe(url: string): Promise<boolean> {
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

async function main() {
  const url =
    "https://unsubscribe.convertkit-mail2.com/8ku0mlzpxxaoh077q34ikhk97mg99a3"; // Replace with an actual unsubscribe URL
  try {
    const success = await autoUnsubscribe(url);
    if (success) {
      console.log("Successfully unsubscribed!");
    } else {
      console.log("Unsubscribe process completed, but confirmation not found.");
    }
  } catch (error) {
    console.error("An error occurred:", error);
  }
}

main();
