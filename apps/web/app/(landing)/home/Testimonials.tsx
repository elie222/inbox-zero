import clsx from "clsx";
import Image from "next/image";

const featuredTestimonial = {
  body: "Loving it so far! Cleaned up my top cluttering newsletter and promotional email subscriptions in just a few minutes.",
  author: {
    name: "Jonni Lundy",
    handle: "jonnilundy",
    imageUrl:
      "https://pbs.twimg.com/profile_images/1651273413053542400/6ul40RRM_400x400.jpg",
    logoUrl: "/images/testimonials/resend-wordmark-black.svg",
  },
};
const testimonials = [
  [
    [
      {
        body: "hey bro, your tool is legit what I been looking for for ages haha. its a god send",
        author: {
          name: "James",
          handle: "james",
          imageUrl:
            "/images/testimonials/midas-hofstra-a6PMA5JEmWE-unsplash.jpg",
        },
      },
      // More testimonials...
    ],
    // [
    //   {
    //     body: "abc",
    //     author: {
    //       name: "abc",
    //       handle: "abc",
    //       imageUrl:
    //         "https://images.unsplash.com/photo-1517841905240-472988babdf9?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80",
    //     },
    //   },
    //   // More testimonials...
    // ],
  ],
  [
    [
      {
        body: "fwiw this looks pretty slick. Connected one of my accounts to check it out.",
        author: {
          name: "Nate Kadlac",
          handle: "kadlac",
          imageUrl:
            "https://pbs.twimg.com/profile_images/1558195781089120256/RWvUylSb_400x400.jpg",
        },
      },
      // More testimonials...
    ],
    // [
    //   {
    //     body: "Molestias ea earum quos nostrum doloremque sed. Quaerat quasi aut velit incidunt excepturi rerum voluptatem minus harum.",
    //     author: {
    //       name: "Leonard Krasner",
    //       handle: "leonardkrasner",
    //       imageUrl:
    //         "https://images.unsplash.com/photo-1519345182560-3f2917c472ef?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80",
    //     },
    //   },
    //   // More testimonials...
    // ],
  ],
];

export function Testimonials() {
  return (
    <div className="relative isolate bg-white pb-20 pt-24 sm:pt-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-xl text-center">
          <h2 className="text-lg font-semibold leading-8 tracking-tight text-blue-600">
            Inbox Zero Love
          </h2>
          <p className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            Clean inbox, happy life.
          </p>
        </div>
        <div className="mx-auto mt-16 grid max-w-2xl grid-cols-1 grid-rows-1 gap-8 text-sm leading-6 text-gray-900 sm:mt-20 sm:grid-cols-2 xl:mx-0 xl:max-w-none xl:grid-flow-col xl:grid-cols-4">
          <figure className="rounded-2xl bg-white shadow-lg ring-1 ring-gray-900/5 sm:col-span-2 xl:col-start-2 xl:row-end-1">
            <blockquote className="p-6 text-lg font-semibold leading-7 tracking-tight text-gray-900 sm:p-12 sm:text-xl sm:leading-8">
              <p>{`“${featuredTestimonial.body}”`}</p>
            </blockquote>
            <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-4 border-t border-gray-900/10 px-6 py-4 sm:flex-nowrap">
              <Image
                className="h-10 w-10 flex-none rounded-full bg-gray-50"
                src={featuredTestimonial.author.imageUrl}
                alt=""
                width={40}
                height={40}
              />
              <div className="flex-auto">
                <div className="font-semibold">
                  {featuredTestimonial.author.name}
                </div>
                <div className="text-gray-600">{`@${featuredTestimonial.author.handle}`}</div>
              </div>
              <Image
                className="h-8 w-auto flex-none"
                src={featuredTestimonial.author.logoUrl}
                alt=""
                height={32}
                width={98}
                unoptimized
              />
            </figcaption>
          </figure>
          {testimonials.map((columnGroup, columnGroupIdx) => (
            <div
              key={columnGroupIdx}
              className="space-y-8 xl:contents xl:space-y-0"
            >
              {columnGroup.map((column, columnIdx) => (
                <div
                  key={columnIdx}
                  className={clsx(
                    (columnGroupIdx === 0 && columnIdx === 0) ||
                      (columnGroupIdx === testimonials.length - 1 &&
                        columnIdx === columnGroup.length - 1)
                      ? "xl:row-span-2"
                      : "xl:row-start-1",
                    "space-y-8",
                  )}
                >
                  {column.map((testimonial) => (
                    <figure
                      key={testimonial.author.handle}
                      className="rounded-2xl bg-white p-6 shadow-lg ring-1 ring-gray-900/5"
                    >
                      <blockquote className="text-gray-900">
                        <p>{`“${testimonial.body}”`}</p>
                      </blockquote>
                      <figcaption className="mt-6 flex items-center gap-x-4">
                        <Image
                          className="h-10 w-10 rounded-full bg-gray-50"
                          src={testimonial.author.imageUrl}
                          alt=""
                          width={40}
                          height={40}
                        />
                        <div>
                          <div className="font-semibold">
                            {testimonial.author.name}
                          </div>
                          <div className="text-gray-600">{`@${testimonial.author.handle}`}</div>
                        </div>
                      </figcaption>
                    </figure>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
