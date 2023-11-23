const faqs = [
  {
    question: "Do you store my emails?",
    answer:
      "No. We don't store any of your emails in our database. And even better, as our code is open-source you can check our code to see this is true. For full data privacy you can self-host your own instance of Inbox Zero.",
  },
  {
    question: "Is the code open-source?",
    answer: "Yes! You can see the source code in our GitHub repository.",
  },
  {
    question: "Do you take feature requests?",
    answer:
      "Yes! Post an issue on GitHub, reach us over email, or tweet us. We're happy to hear how we can improve your email experience.",
  },
];

export function FAQs() {
  return (
    <div
      className="mx-auto max-w-2xl divide-y divide-gray-900/10 px-6 pb-8 sm:pb-24 sm:pt-12 lg:max-w-7xl lg:px-8 lg:pb-32"
      id="faq"
    >
      <h2 className="font-cal text-2xl leading-10 text-gray-900">
        Frequently asked questions
      </h2>
      <dl className="mt-10 space-y-8 divide-y divide-gray-900/10">
        {faqs.map((faq) => (
          <div
            key={faq.question}
            className="pt-8 lg:grid lg:grid-cols-12 lg:gap-8"
          >
            <dt className="text-base font-semibold leading-7 text-gray-900 lg:col-span-5">
              {faq.question}
            </dt>
            <dd className="mt-4 lg:col-span-7 lg:mt-0">
              <p className="text-base leading-7 text-gray-600">{faq.answer}</p>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
