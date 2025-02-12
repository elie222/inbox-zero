// copy pasted from PostHog
export const survey = {
  questions: [
    {
      type: "multiple_choice",
      question: "Which features are you most interested in?",
      choices: [
        "AI Personal Assistant",
        "Bulk Unsubscriber",
        "Cold Email Blocker",
        "Reply Zero (reply tracker)",
        "AI Categorizer",
        "Email Analytics",
        "Other",
      ],
    },
    // {
    //   type: "single_choice",
    //   question: "Which role best describes you?",
    //   choices: [
    //     "Founder",
    //     "Executive",
    //     "Small Business Owner",
    //     "Assistant",
    //     "Investor",
    //     "Sales",
    //     "Marketing",
    //     "Customer Support",
    //     "Software Engineer",
    //     "Student",
    //     "Individual",
    //     "Other",
    //   ],
    // },
    // {
    //   type: "single_choice",
    //   question: "What is the size of your company?",
    //   choices: [
    //     "Only me",
    //     "2-10 people",
    //     "11-100 people",
    //     "101-1000 people",
    //     "1000+ people",
    //   ],
    // },
    {
      type: "single_choice",
      question: "How did you hear about Inbox Zero?",
      choices: [
        "Search",
        "Friend",
        "Twitter",
        "Facebook",
        "YouTube",
        "Reddit",
        "Newsletter",
        "Product Hunt",
        "HackerNews",
        "TikTok",
        "Instagram",
        "Other",
      ],
    },
    {
      type: "open",
      question:
        "Last question! If you had a magic wand, what would you want to improve about your email experience?",
    },
  ],
};
