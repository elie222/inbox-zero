// copy pasted from PostHog
export const survey = {
  questions: [
    {
      type: "multiple_choice",
      question: "Which features are you most interested in?",
      choices: [
        "AI Automation",
        "Newsletter Cleaner",
        "Cold Email Blocker",
        "Email Analytics",
        "Other",
      ],
    },
    {
      type: "single_choice",
      question: "Which role best describes you?",
      choices: [
        "Founder",
        "Executive",
        "Investor",
        "Sales",
        "Marketing",
        "Customer Support",
        "Software Engineer",
        "Other",
      ],
    },
    {
      type: "single_choice",
      question: "What is the size of your company?",
      choices: [
        "Only me",
        "2-10 people",
        "11-100 people",
        "101-1000 people",
        "1000+ people",
      ],
    },
    {
      type: "single_choice",
      question: "How did you hear about Inbox Zero?",
      choices: [
        "Search",
        "Friend",
        "Twitter",
        "YouTube",
        "Newsletter",
        "Product Hunt",
        "HackerNews",
        "TikTok",
        "Other Social Media",
        "Other",
      ],
    },
    {
      type: "open",
      question:
        "If you had a magical AI assistant that helps you handle your email, what tasks would be most helpful for it to perform?",
    },
  ],
};
