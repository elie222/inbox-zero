const faqs = [
  {
    question: "Do you store my emails?",
    answer:
      "We store a hashed version of your emails for our analytics feature. As our code is open-source you can check our code to see this for yourself. All email traffic is securely encrypted with TLS, safeguarding your data against unauthorized access.",
  },

  {
    question: "Do you take feature requests?",
    answer: (
      <>
        Yes! Reach out and{" "}
        <a
          href="mailto:james@devblock.pro"
          target="_blank"
          className="font-semibold hover:underline"
        >
          email
        </a>{" "}
        us. We{"'"}re happy to hear how we can improve your email experience.
      </>
    ),
  },
  {
    question: "Can I still use Syncade alonside my current email client?",
    answer:
      "Yes! Syncade is intended to be used alongside your existing email client.",
  },
  {
    question: "Which email providers does Syncade support?",
    answer:
      "We only support Gmail and Gsuite email accounts today. We may add support for other email providers such as Outlook in the future.",
  },
  {
    question: "Do you offer refunds?",
    answer: (
      <>
        If you don{"'"}t think we provided you with value send us an{" "}
        <a
          href="mailto:james@devblock.pro"
          target="_blank"
          className="font-semibold hover:underline"
        >
          email
        </a>{" "}
        within 14 days of upgrading and we{"'"}ll refund you.
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
