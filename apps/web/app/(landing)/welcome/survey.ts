// copy pasted from PostHog
export const survey = {
  questions: [
    {
      type: "single_choice",
      choices: ["Yes", "No", "Not sure yet"],
      question: "Is newsletter management helpful to you?",
      image: "/images/newsletters.png",
    },
    {
      type: "single_choice",
      choices: ["Yes", "No", "Not sure yet"],
      question: "Are email analytics important to you?",
      image: "/images/stats.png",
    },
    {
      type: "single_choice",
      choices: ["Yes", "No", "Not sure yet"],
      question: "Are you interested in using AI auto responder?",
      image: "/images/rules.png",
    },
    {
      type: "open",
      question:
        "If you had a magical AI assistant that helps you handle your email, what tasks would be most helpful for it to perform?",
      image: "/images/creative-work.svg",
      zoomImage: false,
    },
  ],
};
