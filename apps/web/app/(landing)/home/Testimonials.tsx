"use client";

import clsx from "clsx";
import Image from "next/image";
import Script from "next/script";
import { useTestimonialsVariant } from "@/hooks/useFeatureFlags";

type Testimonial = {
  body: string;
  author: {
    name: string;
    handle: string;
    imageUrl: string;
  };
};

const featuredTestimonial = {
  body: "Loving it so far! Cleaned up my top cluttering newsletter and promotional email subscriptions in just a few minutes.",
  author: {
    name: "Jonni Lundy",
    handle: "jonnilundy",
    imageUrl:
      "https://pbs.twimg.com/profile_images/1651273413053542400/6ul40RRM_400x400.jpg",
    logoUrl: "/images/logos/resend.svg",
  },
};

const stevenTestimonial: Testimonial = {
  body: "Love this new open-source app by @elie2222: getinboxzero.com",
  author: {
    name: "Steven Tey",
    handle: "steventey",
    imageUrl:
      "https://pbs.twimg.com/profile_images/1506792347840888834/dS-r50Je_400x400.jpg",
  },
};

const vinayTestimonial: Testimonial = {
  body: "this is something I've been searching for a long time – thanks for building it.",
  author: {
    name: "Vinay Katiyar",
    handle: "ktyr",
    imageUrl:
      "https://ph-avatars.imgix.net/2743360/28744c72-2267-49ed-999d-5bdab677ec28?auto=compress&codec=mozjpeg&cs=strip&auto=format&w=120&h=120&fit=crop&dpr=2",
  },
};

const yoniTestimonial: Testimonial = {
  body: "Wow. Onboarded and started unsubscribing from the worst spammers in just 3 minutes... Thank you 🙏🏼",
  author: {
    name: "Yoni",
    handle: "",
    imageUrl: "/images/testimonials/joseph-gonzalez-iFgRcqHznqg-unsplash.jpg",
  },
};

const desktopTestimonials: Testimonial[][][] = [
  [
    [
      stevenTestimonial,
      {
        body: "hey bro, your tool is legit what I been looking for for ages haha. its a god send",
        author: {
          name: "James",
          handle: "",
          imageUrl:
            "/images/testimonials/midas-hofstra-a6PMA5JEmWE-unsplash.jpg",
        },
      },
      vinayTestimonial,
    ],
    [
      {
        body: `Finally an "unsubscribe app" that let's you *actually* unsubscribe and filter using Gmail filters (instead of always relying on the 3rd party app to filter those emails). Big plus for me, so I have all filters in one place (inside the Gmail filters, that is). Awesome work! Already a fan :)`,
        author: {
          name: "Wilco de Kreij",
          handle: "emarky",
          imageUrl:
            "https://ph-avatars.imgix.net/28450/8c4c8039-003a-4b3f-80ec-7035cedb6ac3?auto=compress&codec=mozjpeg&cs=strip&auto=format&w=120&h=120&fit=crop&dpr=2",
        },
      },
    ],
  ],
  [
    [
      {
        body: "I was mostly hoping to turn my email inbox into less of the mess that it is. I've been losing tasks that I should do as the emails get buried. So far it's really helped.",
        author: {
          name: "Steve Radabaugh",
          handle: "stevenpaulr",
          imageUrl: "/images/home/testimonials/steve-rad.png",
        },
      },
      {
        body: "Kudos on the launch😊 I like how easily subscriptions can be managed!",
        author: {
          name: "Prem Saini",
          handle: "prem_saini1",
          imageUrl:
            "https://ph-avatars.imgix.net/4438396/079fabcb-7d01-42d9-a98f-2fc7befce04e?auto=compress&codec=mozjpeg&cs=strip&auto=format&w=120&h=120&fit=crop&dpr=2",
        },
      },
    ],
    [
      yoniTestimonial,
      {
        body: "SUPER excited for this one! Well done, going to get use out of it for sure—have been waiting for a tool like this, it just makes so much sense to have as a layer atop email.",
        author: {
          name: "Alex Bass",
          handle: "alexhbass",
          imageUrl:
            "https://ph-avatars.imgix.net/3523155/original?auto=compress&codec=mozjpeg&cs=strip&auto=format&w=120&h=120&fit=crop&dpr=2",
        },
      },
    ],
  ],
];

const mobileTestimonials: Testimonial[] = [
  vinayTestimonial,
  stevenTestimonial,
  yoniTestimonial,
];

export function Testimonials() {
  const variant = useTestimonialsVariant();

  return (
    <div className="relative isolate bg-white pb-20 pt-24">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-xl text-center">
          <h2 className="text-lg font-semibold leading-8 tracking-tight text-blue-600">
            Inbox Zero Love
          </h2>
          <p className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            Join thousands who spend less time on email
          </p>
        </div>

        {variant === "senja-widget" ? (
          <SenjaWidgetContent />
        ) : (
          <TestimonialsContent />
        )}
      </div>
    </div>
  );
}

function TestimonialsContent() {
  return (
    <>
      {/* Mobile */}
      <div className="mx-auto mt-16 grid max-w-2xl gap-4 text-sm leading-6 text-gray-900 sm:hidden">
        {mobileTestimonials.map((testimonial) => (
          <figure
            key={testimonial.author.name}
            className="rounded-2xl bg-white p-6 shadow-lg ring-1 ring-gray-900/5"
          >
            <blockquote className="text-gray-900">
              <p>{`"${testimonial.body}"`}</p>
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
                <div className="font-semibold">{testimonial.author.name}</div>
                {testimonial.author.handle ? (
                  <div className="text-gray-600">
                    @{testimonial.author.handle}
                  </div>
                ) : undefined}
              </div>
            </figcaption>
          </figure>
        ))}
      </div>

      {/* Desktop */}
      <div className="mx-auto mt-16 hidden max-w-2xl grid-cols-1 grid-rows-1 gap-8 text-sm leading-6 text-gray-900 sm:mt-20 sm:grid sm:grid-cols-2 xl:mx-0 xl:max-w-none xl:grid-flow-col xl:grid-cols-4">
        <figure className="rounded-2xl bg-white shadow-lg ring-1 ring-gray-900/5 sm:col-span-2 xl:col-start-2 xl:row-end-1">
          <blockquote className="p-6 text-lg font-semibold leading-7 tracking-tight text-gray-900 sm:p-12 sm:text-xl sm:leading-8">
            <p>{`"${featuredTestimonial.body}"`}</p>
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

        {desktopTestimonials.map((columnGroup, columnGroupIdx) => (
          <div
            key={columnGroupIdx}
            className="space-y-8 xl:contents xl:space-y-0"
          >
            {columnGroup.map((column, columnIdx) => (
              <div
                key={columnIdx}
                className={clsx(
                  (columnGroupIdx === 0 && columnIdx === 0) ||
                    (columnGroupIdx === desktopTestimonials.length - 1 &&
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
                      <p>{`"${testimonial.body}"`}</p>
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
                        {testimonial.author.handle ? (
                          <div className="text-gray-600">
                            @{testimonial.author.handle}
                          </div>
                        ) : undefined}
                      </div>
                    </figcaption>
                  </figure>
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

function SenjaWidgetContent() {
  return (
    <div className="mt-16">
      <Script
        src="https://widget.senja.io/widget/321e14fc-aa08-41f8-8dfd-ed3cd75d1308/platform.js"
        strategy="lazyOnload"
      />
      <div
        className="senja-embed"
        data-id="321e14fc-aa08-41f8-8dfd-ed3cd75d1308"
        data-mode="shadow"
        data-lazyload="false"
        style={{ display: "block", width: "100%" }}
      />
    </div>
  );
}
