import { describe, expect, test, vi, beforeEach } from "vitest";
import { aiSummarizeEmailForDigest } from "@/utils/ai/digest/summarize-email-for-digest";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { EmailForLLM } from "@/utils/types";

const TIMEOUT = 15_000;

type EmailAccountForDigest = EmailAccountWithAI & { name: string | null };

// Run with: pnpm test-ai ai-summarize-email-for-digest

vi.mock("server-only", () => ({}));

const isAiTest = process.env.RUN_AI_TESTS === "true";

function getEmailAccount(overrides = {}): EmailAccountForDigest {
  return {
    id: "email-account-id",
    userId: "user1",
    email: "user@test.com",
    about: "Software engineer working on email automation",
    name: "Test User",
    account: {
      provider: "gmail",
    },
    user: {
      aiModel: "gpt-4",
      aiProvider: "openai",
      aiApiKey: process.env.OPENAI_API_KEY || null,
    },
    ...overrides,
  };
}

function getTestEmail(overrides = {}): EmailForLLM {
  return {
    id: "email-id",
    from: "sender@example.com",
    to: "user@test.com",
    subject: "Test Email",
    content: "This is a test email content",
    ...overrides,
  };
}

describe.runIf(isAiTest)("aiSummarizeEmailForDigest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test(
    "successfully summarizes email with order details",
    async () => {
      const emailAccount = getEmailAccount();
      const messageToSummarize = getTestEmail({
        from: "orders@example.com",
        subject: "Order Confirmation #12345",
        content:
          "Thank you for your order! Order #12345 has been confirmed. Date: 2024-03-20. Items: 3. Total: $99.99",
      });

      const result = await aiSummarizeEmailForDigest({
        ruleName: "order",
        emailAccount,
        messageToSummarize,
      });

      console.debug("Generated content:\n", result);

      expect(result).toMatchObject({
        content: expect.any(String),
      });

      // Verify the result has the expected structure
      expect(result).toBeDefined();
      expect(result).toHaveProperty("content");
      expect(typeof result?.content).toBe("string");
    },
    TIMEOUT,
  );

  test(
    "successfully summarizes email with meeting notes",
    async () => {
      const emailAccount = getEmailAccount();
      const messageToSummarize = getTestEmail({
        from: "team@example.com",
        subject: "Weekly Team Meeting Notes",
        content:
          "Hi team, Here are the notes from our weekly meeting: 1. Project timeline updated - Phase 1 completion delayed by 1 week 2. New team member joining next week 3. Client presentation scheduled for Friday",
      });

      const result = await aiSummarizeEmailForDigest({
        ruleName: "meeting",
        emailAccount,
        messageToSummarize,
      });

      console.debug("Generated content:\n", result);

      expect(result).toMatchObject({
        content: expect.any(String),
      });

      // Verify the result has the expected structure
      expect(result).toBeDefined();
      expect(result).toHaveProperty("content");
      expect(typeof result?.content).toBe("string");
    },
    TIMEOUT,
  );

  test(
    "handles empty email content gracefully",
    async () => {
      const emailAccount = getEmailAccount();
      const messageToSummarize = getTestEmail({
        from: "empty@example.com",
        subject: "Empty Email",
        content: "",
      });

      const result = await aiSummarizeEmailForDigest({
        ruleName: "other",
        emailAccount,
        messageToSummarize,
      });

      console.debug("Generated content:\n", result);

      expect(result).toMatchObject({
        content: expect.any(String),
      });
    },
    TIMEOUT,
  );

  test(
    "handles null message gracefully",
    async () => {
      const emailAccount = getEmailAccount();

      const result = await aiSummarizeEmailForDigest({
        ruleName: "other",
        emailAccount,
        messageToSummarize: null as any,
      });

      expect(result).toBeNull();
    },
    TIMEOUT,
  );

  test(
    "handles different user configurations",
    async () => {
      const emailAccount = getEmailAccount({
        about: "Marketing manager focused on customer engagement",
        name: "Marketing User",
      });

      const messageToSummarize = getTestEmail({
        from: "newsletter@company.com",
        subject: "Weekly Marketing Update",
        content:
          "This week's marketing metrics: Email open rate: 25%, Click-through rate: 3.2%, Conversion rate: 1.8%",
      });

      const result = await aiSummarizeEmailForDigest({
        ruleName: "newsletter",
        emailAccount,
        messageToSummarize,
      });

      console.debug("Generated content:\n", result);

      expect(result).toMatchObject({
        content: expect.any(String),
      });
    },
    TIMEOUT,
  );

  test(
    "handles various email categories correctly",
    async () => {
      const emailAccount = getEmailAccount();
      const categories = ["invoice", "receipt", "travel", "notification"];

      for (const category of categories) {
        const messageToSummarize = getTestEmail({
          from: `${category}@example.com`,
          subject: `Test ${category} email`,
          content: `This is a test ${category} email with sample content`,
        });

        const result = await aiSummarizeEmailForDigest({
          ruleName: category,
          emailAccount,
          messageToSummarize,
        });

        console.debug(`Generated content for ${category}:\n`, result);

        expect(result).toMatchObject({
          content: expect.any(String),
        });
      }
    },
    TIMEOUT * 2,
  );

  test(
    "handles promotional emails appropriately",
    async () => {
      const emailAccount = getEmailAccount();
      const messageToSummarize = getTestEmail({
        from: "promotions@store.com",
        subject: "50% OFF Everything! Limited Time Only!",
        content:
          "Don't miss our biggest sale of the year! Everything is 50% off for the next 24 hours only!",
      });

      const result = await aiSummarizeEmailForDigest({
        ruleName: "marketing",
        emailAccount,
        messageToSummarize,
      });

      console.debug("Generated content:\n", result);

      expect(result).toMatchObject({
        content: expect.any(String),
      });
    },
    TIMEOUT,
  );

  test(
    "handles direct messages to user in second person",
    async () => {
      const emailAccount = getEmailAccount();
      const messageToSummarize = getTestEmail({
        from: "hr@company.com",
        subject: "Your Annual Review is Due",
        content:
          "Hi Test User, Your annual performance review is due by Friday. Please complete the self-assessment form and schedule a meeting with your manager.",
      });

      const result = await aiSummarizeEmailForDigest({
        ruleName: "hr",
        emailAccount,
        messageToSummarize,
      });

      console.debug("Generated content:\n", result);

      expect(result).toMatchObject({
        content: expect.any(String),
      });
    },
    TIMEOUT,
  );

  test(
    "handles edge case with very long email content",
    async () => {
      const emailAccount = getEmailAccount();
      const longContent = `${"This is a very long email content. ".repeat(
        100,
      )}End of long content.`;

      const messageToSummarize = getTestEmail({
        from: "long@example.com",
        subject: "Very Long Email",
        content: longContent,
      });

      const result = await aiSummarizeEmailForDigest({
        ruleName: "other",
        emailAccount,
        messageToSummarize,
      });

      console.debug("Generated content:\n", result);

      expect(result).toMatchObject({
        content: expect.any(String),
      });
    },
    TIMEOUT,
  );

  test(
    "summarizes newsletter about building apps with engaging direct style",
    async () => {
      const emailAccount = getEmailAccount();
      const messageToSummarize = getTestEmail({
        from: "Pat @ Starter Story",
        subject: '"am I too late?"',
        content: `One of my buddies text me this the other day:

"Dude I see you talking about building apps all the time. Am I too late?"

That same day I came across this simple habits app making $30K/month.

Here's what's crazy… 

There are a bajillion habit tracker apps out there.

Literally thousands of them.

But this guy decided to build one anyway.

He built it fast, marketed it, and now he's making $30K/month.

His life is completely changed.

All because he decided to BUILD instead of asking "is it too late?"

The biggest apps haven't even been built yet.

We're still in the early days of all this AI apps stuff. 

And here's the best part:

For the first time ever, you don't need to be a developer to build a product.

AI coding tools are making it so that anyone can build an app.

In a few hours. With just a few prompts. A real working app. 

So while most people sit around waiting for "the perfect idea" or wondering if they missed their chance...

The real builders are already launching.

Are you going to be one of them?
The AI App Bootcamp is starting soon.

It's a sprint where we teach you how to use AI coding tools to build a working app.

Imagine this: in less than 2 weeks, you'll go from idea → actual product.

And you'll do it alongside a group of builders all pushing each other forward.

You could keep wondering if it's too late...

Or you can choose to build.

Your Choice
– Pat`,
      });

      const result = await aiSummarizeEmailForDigest({
        ruleName: "newsletter",
        emailAccount,
        messageToSummarize,
      });

      console.debug("Generated content:\n", result);

      expect(result).toBeDefined();
      expect(result).toHaveProperty("content");

      const content = result?.content || "";

      // Verify it doesn't use meta-commentary
      expect(content.toLowerCase()).not.toContain("reflects on");
      expect(content.toLowerCase()).not.toContain("highlights");
      expect(content.toLowerCase()).not.toContain("discusses");

      // Should include key details
      expect(content.toLowerCase()).toContain("30k");
      expect(content.toLowerCase()).toContain("habit");

      // Should be concise - digest should have 3-4 points max (count newlines)
      const lines = content.split("\n").filter((line) => line.trim());
      expect(lines.length).toBeLessThanOrEqual(4);
    },
    TIMEOUT,
  );

  test(
    "summarizes newsletter from next play",
    async () => {
      const emailAccount = getEmailAccount();
      const messageToSummarize = getTestEmail({
        from: "ben at next play",
        subject:
          "How a hot AI startup got 800+ business customers by following their curiosity",
        content: `Forwarded this email? Subscribe here for more
How a hot AI startup got 800+ business customers by following their curiosity
What is it like to work at Pylon?
Oct 2
 




READ IN APP
 
✨ Hey there this is a free edition of next play’s newsletter, where we share under-the-radar opportunities to help you figure out what’s next in your journey. Join our private Slack community here and access $1000s of dollars of product discounts here.

I would like to believe that we all start out as very curious kids. Full of creative ideas and big imaginations.

But as you get older, it seems as if you often start to lose that spark. That curious calling. You slowly start becoming comfortable with your little corner of the world, and stop asking questions or pursuing your random ideas. You stick to what you know, because what you know is often more predictable (and feels safer!).

This evolution is common but not necessarily effective for people. In fact, it often can be very limiting. Particularly when they are in a place of looking for a new job or thinking about starting a company. It can be helpful to embrace what’s next with an open mind, and work backwards from what is actually best for you at the time, as opposed to constraining yourself to what you know.

This same philosophy also applies to organizations. You often see startups, as they become older and accumulate more resources, become less curious. They stop asking questions of themselves and their customers, and start sticking to what they (think they) know. This can work well in more mature businesses. But in the technology industry, especially when things are moving quickly, closed-mindedness can really cause you to miss out on big opportunities. It can also ruin your culture, as the status quo and internal politics get in the way of getting things done.

So one thing I look for—in both the people and startups that I meet—is how open-minded they seem. How much do they embrace curiosity? How imaginative are they? How stuck in their ways are they? How much do they focus on the status quo as opposed to working backwards from first principles?

That’s what really stood out in meeting the team at Pylon. They seemed like really uniquely curious and open-minded people. And they seemed to have built a culture that enabled that curiosity, and curious people more generally, to thrive (as opposed to what we often see: slow-moving stagnation).

How have they done this?
Maybe because curiosity has been the core of the company since the very beginning. The founders had known each other for a while (Advith and Robert met at Caltech and then later met Marty during the Kleiner Perkins Fellowship). They were software engineers at companies like Airbnb, Samsara, and Affinity. They followed their curiosity, after they all noticed a similar trend at their companies (chat-based platforms like Slack and Microsoft Teams were replacing email in B2B comms, and in turn, breaking conventional post-sales comms workflows). Rather than carry on, they paused and asked themselves: what should come next?

This insight, while subtle, eventually led to the founding of Pylon, which is now a full-featured AI-powered support platform built specifically for B2B companies. And they’ve been growing quickly:

800+ businesses as customers including Linear, Cognition (makers of Devin), and Modal Labs.

Raised a $31m Series B from a16z and Bain Capital Ventures

Recently made this year’s Enterprise Tech 30 List.

Hiring for 24 roles in SF across engineering, GTM, product, and support.

So how have they managed to maintain a culture that encourages curiosity and creativity? What are people on the team like? What’s it like to work at the company? All that and more in this Next Play Spotlight.


Major thanks to the Pylon team for sharing behind-the-scenes details and supporting Next Play.

Pylon is the type of company that has a very large product roadmap. They operate in a really big space with lots of customers hungry for better software, and so there’s a ton of stuff that they could build that would add tremendous value.

But in order to figure out precisely what to build, and in what order and in what way, they have a lot of decisions to make. Lots of in the weeds decisions that require understanding complicated systems. So really the only way for them to scale quickly while expanding their product offering is to hire people they can trust that will take ownership of their area. And to do that, they’ve needed to build a culture that really fosters the ownership mentality.


You sometimes meet companies that say they want to hire people who “think like owners” or “operate with a founder mentality,” but once you peek under the curtain you see a bunch of red flags: like hearing stories of how people very quickly shoot down new ideas or how processes keep getting in the way of creativity. It’s very hard to act like a true owner when you are constantly being blocked, and it’s even worse when those blockers are coming from internal stakeholders.

The culture of Pylon seems to orient in the other direction—people feel very free to experiment with whatever they think will get results, to at least learn and gain conviction as they make decisions. This is a big part of instilling the ownership mindset, as they give people freedom to make decisions.

For example, they have a culture that empowers people to own their area and experiment with solutions that’ll help drive results. And it’s for this reason: it is one thing to philosophize around what you think is best. And that can sometimes be useful. But oftentimes, ideas need to be tested out in the real world. With real customers. With real, unbiased feedback. You can let the results do the talking once you launch. Before then, it’s all just hypothetical.

And so at Pylon, they encourage people to launch fast.

“The company moves fast, and isn’t built on promises, it’s built on action.”

People often get in their own way trying to get everything perfect upfront. That’ll often slow you and the entire team down. It’s also just an impossible expectation for people to meet. It can be more effective to just ship the product, gather learnings, and iterate from there. That’s part of how the team at Pylon pushes the pace of progress.

“People who can move fast and not be perfectionists. Engineering is a tool for the business to achieve optimal outcomes, but a lot of times, people put the cart before the horse and build things for the sake of building things without thinking about business impact or ROI.”

They want people with a bias towards action. Not just people who can talk loudly around their ideas. But people who can actually walk the walk.

“Flex your bias for action. While my first point was more about product feedback cycles, this covers dogfooding the product. If you see or feel there is room to improve your individual or team’s workflow in the product, make those adjustments and let others know what you did. Don’t wait, you’ve already lost the efficiency gain from the idea in the first place if you do.”

People at the company seem to rally around this very “risk-on” / experimental mindset; they are not afraid to run tests and encourage one another to pursue their ideas. Even if ideas seem to be more on the creative side.

“Sometimes you might have ideas that seem so crazy or so new that you’re not sure if it will be received well, or if it’ll even be possible to execute. Oftentimes, those decisions always perform the best. For example, when I first joined I knew I wanted to ramp up video marketing. Even though I’d never officially done any video editing or filming, I figured out the details quickly and just executed. Now we’re hiring freelancers and really building out this motion because it’s clearly been a differentiator. If you have an idea, just execute it. You won’t know until you try.”


These experiments of course do not always work out. People on the team know that. What matters most is how you respond to them. Do you hide from results? Or do you look at them honestly and maximize your learnings?

“Own mistakes, take accountability, improve, and move forward (quickly).”

People at Pylon do the opposite of hide; they very much encourage people to dig into details and ask lots of questions. They really want people to follow their curiosities and get to the root level of understanding of things.

“Try not to get overwhelmed by the sheer amount of product & code - just focus on getting each task done, you’ll learn and get up to speed naturally. Also, ask lots of questions - your fellow team members know a lot about the product, customers and tech that can help you jump start your work.”

“I think someone who doesn’t mind getting their hands in the mess -- there’s still a lot to build and our product / customer base is expanding rapidly, so we need people who like getting into the nitty gritty but can balance that out with thinking about how to improve processes on a larger scale.”

This includes the founder/CEO Marty, who spends a lot of time in the weeds understanding details and asking questions.

“I think it’s easy for a lot of CEOs/founders to start distancing themselves from the rest of the company or start to act “above” the rest of the team. But Marty has been so different than other “leaders” I’ve worked with. The fact that he’s still so invested in day to day work across sales and marketing and willing to put in the time to work with every function is incredibly inspiring. And to me, it’s a large part of my confidence in Pylon winning + becoming a generational company. I’m inspired to work hard every day when I see my founders next to me in the weeds, doing IC work like everyone else.”

Following your curiosity as you pick up on the details is a big part of this process, and applies to everything from asking questions about customers to dogfooding the product and using it yourself.

“You need to be able to work independently and be self-driven with a curiosity “to learn everything there is” since the product offers a lot of surface. You should get joy out of exploring the product and understanding how things work under the hood, since you will be doing that a lot .”

This helps people from across the company build a really deep intuition for the product and for the customer, which is an essential input into building something great.

“I think having a good product sense is pretty important for success at this point. Our product has expanded a lot both in terms of breadth and depth, so even the founders don’t have context on the entire product anymore. We also don’t have product managers right now, so you’ll have to make product decisions on your own.”

“We look for people who really think about product decisions from a customer perspective. At Pylon, we’re very tactical with our work - we keep our customers’ needs in mind and focus on building what is needed the most. This has been really interesting to see, because it has helped me understand how effective startups work.”

And, if you can harness that product sense and blend that with your internal intuition, there’s a ton of opportunity to make an impact. They are at that very unique and exciting hypergrowth startup stage. The business seems to be really growing.

“The company is also doing great, which bodes well for anyone who joins now.”

Importantly, people seem to be having fun along the way.

“You should join the company first and foremost because it’s extremely fun. I joined because I was pretty tired and frustrated at my old job, and now after 1.5 years at Pylon, I still feel excited to go to work every day, and have lots of fun, both in the work itself, and with the coworkers/fun culture/memes/vibes.”

“Pylon is the most fun I’ve ever had in my career. We are winning and having a great time doing it.”

“You’ll have fun with us, guaranteed.”

To be clear, fun does not mean the job is easy or very straightforward. There’s a lot of hard work to be done. They call it “happy grinding.”

“We think of ourselves as “happy grinders.” We primarily work hard because we think it’s fun. Of course there are going to be stressful times, but ultimately we try to not take ourselves too seriously.”

They are the type of people who have FUN taking on complicated problems and working hard. And they are looking for more people who resonate with that philosophy.


They aren’t going to hold your hand telling you what to do. There’s not really time for that.

“I think if you are used to a highly structured environment or want a role where your responsibilities are narrow and very well-defined, it might not be the right fit. We do try to help everyone succeed, but there is a fair amount of initiative involved in everyone’s job at this stage. You will have to work directly with many other functions, between engineering, support, customer success, design, marketing, etc. And although you will be given projects and tasks to work on, the most successful people also bring ideas of ways they can have even more impact without being always explicitly told to do those things.”

They aren’t going to put you in 100 meetings where you have to answer to some bureaucratic processes.

“There are almost no recurring internal meetings! On a given day, I might have zero to 3 meetings, and those meetings are often either interviews or external calls. The beauty of working in person 5 days a week means that you can literally just stand up and go talk to someone without having to constantly schedule meetings.”

“We don’t have a lot of regular meetings as a company. The design team has two scheduled design reviews every week on Tuesdays and Thursdays because we produce better work with feedback, and that’s my only and favorite meeting!”


Instead, they’ll give you space so you can do your best work. So you can do you, follow your curiosities, and make a big impact.

“The founders are great at letting people do the work that needs to be done. While timelines can sometimes be very tight, they know when they need to step in, and more impressively, when not to.”

You can make an impact on the product and customers.

“One of the things that I thought about as a new grad was the impact I would have at a startup, and the product that you’re building can really determine the scale of impact you have. What’s amazing about Pylon is that the product is a system of record for post-sales operations. That means that unlike a lot of products which are layers in between different services or integrations, all of your customer conversations and support operations live on Pylon. It’s a unified platform that knows what customers are dealing with and what they want from a company’s product. This makes it such a powerful platform to build features for. There are countless opportunities to incorporate AI into critical enterprise post-sales processes and become the core platform for being the connection between your customers and your product teams. I’m excited about the direction that the company is heading in and to see it grow into a much bigger company.”

“Depending on what you are looking for in a job, Pylon can give you all of this: Ownership , Growth, a great environment with a bunch of smart people, responsibility, and challenging tasks to work on - you can fully focus on your career and your job. It really depends on you: If you put much in, you will get a lot out of it.”

And you can also very quickly make an impact on the culture.

“Franz Heller, our founding Solutions Engineer joined a few months ago and has already made a huge impact on the Solutions/FDE team. He also started a run club within the company. Being in person five days a week really enables us to do all these things, and also for strong cross-communication between teams.”

“The culture at Pylon is definitely a little eccentric in some ways. For example, we have a tradition of getting a piñata filled with random goodies for employee’s birthdays.”

“When I had a friend visit the office, she specifically commented on how friendly and open everyone was which I think is something you don’t always see in a high-productivity environment. One of our rituals is having a strong meal culture -- I’ve worked places before where it felt like you weren’t being productive enough if you didn’t eat at your desk, but here we encourage everyone to take a break and come connect together for meal(s).”


If that all sounds interesting to you, Pylon is hiring for 24 roles in SF across engineering, GTM, product, and support.

And if you are looking for more opportunities, be sure to check out Next Play.

You're currently a free subscriber to next play. For the full experience, upgrade your subscription.

Upgrade to paid`,
      });

      const result = await aiSummarizeEmailForDigest({
        ruleName: "newsletter",
        emailAccount,
        messageToSummarize,
      });

      console.debug("Generated content:\n", result);

      expect(result).toBeDefined();
      expect(result).toHaveProperty("content");

      const content = result?.content || "";

      // Should include key details about Pylon
      expect(content.toLowerCase()).toContain("pylon");
      expect(content.toLowerCase()).toContain("800");

      // Should be concise - digest should have 3-4 points max (count newlines)
      const lines = content.split("\n").filter((line) => line.trim());
      expect(lines.length).toBeLessThanOrEqual(5);
    },
    TIMEOUT,
  );
});
