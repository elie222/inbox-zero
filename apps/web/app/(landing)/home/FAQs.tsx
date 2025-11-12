const faqs = [
  {
    question: "Which email providers does Inbox Zero support?",
    answer:
      "We support Gmail, Google Workspace, and Microsoft Outlook email accounts.",
  },
  {
    question: "Will Inbox Zero replace my current email client?",
    answer:
      "No! Inbox Zero isn't an email client. It's used alongside your existing email client. You continue to use Google or Outlook.",
  },
  {
    question: "Do you offer refunds?",
    answer: (
      <>
        Yes, if you don{"'"}t think we provided you with value send us an{" "}
        <a
          href="mailto:elie@getinboxzero.com"
          target="_blank"
          className="font-semibold hover:underline"
          rel="noreferrer"
        >
          email
        </a>{" "}
        within 14 days of upgrading and we{"'"}ll refund you.
      </>
    ),
  },
  {
    question: "How can I request a feature?",
    answer: (
      <>
        Yes! Email{" "}
        <a
          href="mailto:elie@getinboxzero.com"
          target="_blank"
          className="font-semibold hover:underline"
          rel="noreferrer"
        >
          us
        </a>{" "}
        or post an issue on{" "}
        <a
          href="/github"
          target="_blank"
          className="font-semibold hover:underline"
          rel="noreferrer"
        >
          GitHub
        </a>
        . We{"'"}re happy to hear how we can improve your email experience.
      </>
    ),
  },
  {
    question: "Is the code open-source?",
    answer: (
      <>
        Yes! You can see the source code in our{" "}
        <a
          href="/github"
          target="_blank"
          className="font-semibold hover:underline"
          rel="noreferrer"
        >
          GitHub repo
        </a>
        .
      </>
    ),
  },
];

export function FAQs() {
  return (
    <div
      className="mx-auto max-w-2xl divide-y divide-gray-900/10 px-6 pb-8 sm:pb-24 sm:pt-12 lg:max-w-7xl lg:px-8 lg:pb-32"
      id="faq"
    >
      <h2 className="font-title text-2xl leading-10 text-gray-900">
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
