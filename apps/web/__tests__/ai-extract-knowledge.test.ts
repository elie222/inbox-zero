import { describe, expect, test, vi, beforeEach } from "vitest";
import { aiExtractRelevantKnowledge } from "@/utils/ai/knowledge/extract";
import type { Knowledge } from "@prisma/client";
import { getEmailAccount } from "@/__tests__/helpers";

const TIMEOUT = 30_000;

// pnpm test-ai ai-extract-knowledge

vi.mock("server-only", () => ({}));

// Skip tests unless explicitly running AI tests
const isAiTest = process.env.RUN_AI_TESTS === "true";

function getKnowledgeBase(): Knowledge[] {
  return [
    {
      id: "1",
      emailAccountId: "test-user-id",
      title: "Instagram Sponsorship Rates",
      content: `For brand sponsorships on Instagram, my standard rate is $5,000 per post. 
      This includes one main feed post with up to 3 stories. For longer term partnerships 
      (3+ posts), I offer a 20% discount.`,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: "2",
      emailAccountId: "test-user-id",
      title: "YouTube Sponsorship Packages",
      content: `My YouTube sponsorship packages start at $10,000 for a 60-90 second 
      integration. This includes one round of revisions and a draft review before posting. 
      The video will remain on my channel indefinitely.`,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: "3",
      emailAccountId: "test-user-id",
      title: "TikTok Collaboration Rates",
      content: `For TikTok collaborations, I charge $3,000 per video. This includes 
      concept development, filming, and editing. I typically post between 6-8pm EST 
      for maximum engagement. All sponsored content is marked with #ad as required.`,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: "4",
      emailAccountId: "test-user-id",
      title: "Speaking Engagements",
      content: `I'm available for keynote speaking at tech and marketing conferences. 
      My speaking fee is $15,000 for in-person events and $5,000 for virtual events. 
      Topics include digital marketing, content creation, and building engaged communities. 
      Travel expenses must be covered separately for events outside of California.`,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: "5",
      emailAccountId: "test-user-id",
      title: "Brand Ambassador Programs",
      content: `For long-term brand ambassador roles, I offer quarterly packages starting 
      at $50,000. This includes monthly content across all platforms (Instagram, YouTube, 
      and TikTok), two virtual meet-and-greets with your team, and exclusive rights in 
      your product category. Minimum commitment is 6 months.`,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: "6",
      emailAccountId: "test-user-id",
      title: "Consulting Services",
      content: `I offer social media strategy consulting for brands and creators. 
      Hourly rate is $500, with package options available:
      - Strategy audit & recommendations: $2,500
      - Monthly strategy calls & support: $1,500/month
      - Team training workshop: $5,000/day
      All consulting includes a detailed PDF report and action items.`,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];
}

describe.runIf(isAiTest)("aiExtractRelevantKnowledge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test(
    "extracts Instagram pricing knowledge when asked about Instagram sponsorship",
    async () => {
      const emailContent =
        "Hi! I'm interested in doing an Instagram sponsorship with you. What are your rates?";

      const result = await aiExtractRelevantKnowledge({
        knowledgeBase: getKnowledgeBase(),
        emailContent,
        emailAccount: getEmailAccount(),
      });

      expect(result?.relevantContent).toBeDefined();
      expect(result?.relevantContent).toMatch(/\$5,000 per post/i);
      expect(result?.relevantContent).toMatch(/3 stories/i);
      console.debug(
        "Generated content for Instagram query:\n",
        result?.relevantContent,
      );
    },
    TIMEOUT,
  );

  test(
    "extracts YouTube pricing knowledge when asked about video sponsorship",
    async () => {
      const emailContent =
        "We'd love to sponsor a video on your YouTube channel. Could you share your rates for video integrations?";

      const result = await aiExtractRelevantKnowledge({
        knowledgeBase: getKnowledgeBase(),
        emailContent,
        emailAccount: getEmailAccount(),
      });

      expect(result?.relevantContent).toBeDefined();
      expect(result?.relevantContent).toMatch(/\$10,000/i);
      expect(result?.relevantContent).toMatch(/60-90 second integration/i);
      console.debug(
        "Generated content for YouTube query:\n",
        result?.relevantContent,
      );
    },
    TIMEOUT,
  );

  test(
    "extracts TikTok pricing knowledge when asked about TikTok collaboration",
    async () => {
      const emailContent =
        "Hey! Looking to collaborate on TikTok. What's your rate for sponsored content?";

      const result = await aiExtractRelevantKnowledge({
        knowledgeBase: getKnowledgeBase(),
        emailContent,
        emailAccount: getEmailAccount(),
      });

      expect(result?.relevantContent).toBeDefined();
      expect(result?.relevantContent).toMatch(/\$3,000 per video/i);
      expect(result?.relevantContent).toMatch(/6-8pm EST/i);
      console.debug(
        "Generated content for TikTok query:\n",
        result?.relevantContent,
      );
    },
    TIMEOUT,
  );

  test("handles empty knowledge base", async () => {
    const emailContent = "What are your sponsorship rates?";

    const result = await aiExtractRelevantKnowledge({
      knowledgeBase: [],
      emailContent,
      emailAccount: getEmailAccount(),
    });

    expect(result?.relevantContent).toBe("");
  });

  test(
    "extracts multiple platform knowledge for general sponsorship inquiry",
    async () => {
      const emailContent =
        "Hi! We're a brand looking to work with you across multiple platforms. Could you share your rates?";

      const result = await aiExtractRelevantKnowledge({
        knowledgeBase: getKnowledgeBase(),
        emailContent,
        emailAccount: getEmailAccount(),
      });

      expect(result?.relevantContent).toBeDefined();
      expect(result?.relevantContent).toMatch(/instagram/i);
      expect(result?.relevantContent).toMatch(/youtube/i);
      expect(result?.relevantContent).toMatch(/tiktok/i);
      console.debug(
        "Generated content for multi-platform query:\n",
        result?.relevantContent,
      );
    },
    TIMEOUT,
  );

  test(
    "extracts speaking engagement information when asked about keynote speaking",
    async () => {
      const emailContent =
        "Hi! We're organizing a tech conference in New York and would love to have you as a keynote speaker. What are your speaking fees?";

      const result = await aiExtractRelevantKnowledge({
        knowledgeBase: getKnowledgeBase(),
        emailContent,
        emailAccount: getEmailAccount(),
      });

      expect(result?.relevantContent).toBeDefined();
      expect(result?.relevantContent).toMatch(/\$15,000 for in-person events/i);
      expect(result?.relevantContent).toMatch(/travel expenses/i);
      console.debug(
        "Generated content for speaking engagement query:\n",
        result?.relevantContent,
      );
    },
    TIMEOUT,
  );

  test(
    "extracts consulting information when asked about strategy services",
    async () => {
      const emailContent =
        "We're interested in getting your help with our social media strategy. Can you tell me about your consulting services and rates?";

      const result = await aiExtractRelevantKnowledge({
        knowledgeBase: getKnowledgeBase(),
        emailContent,
        emailAccount: getEmailAccount(),
      });

      expect(result?.relevantContent).toBeDefined();
      expect(result?.relevantContent).toMatch(/\$500/i);
      expect(result?.relevantContent).toMatch(/strategy audit/i);
      console.debug(
        "Generated content for consulting query:\n",
        result?.relevantContent,
      );
    },
    TIMEOUT,
  );

  test(
    "extracts brand ambassador details for long-term partnership inquiry",
    async () => {
      const emailContent =
        "Our brand is looking for a long-term ambassador. We'd like to work with you across all platforms for at least a year. What are your rates for this type of partnership?";

      const result = await aiExtractRelevantKnowledge({
        knowledgeBase: getKnowledgeBase(),
        emailContent,
        emailAccount: getEmailAccount(),
      });

      expect(result?.relevantContent).toBeDefined();
      expect(result?.relevantContent).toMatch(/\$50,000/i);
      expect(result?.relevantContent).toMatch(/quarterly packages/i);
      expect(result?.relevantContent).toMatch(/6 months/i);
      console.debug(
        "Generated content for brand ambassador query:\n",
        result?.relevantContent,
      );
    },
    TIMEOUT,
  );
});
