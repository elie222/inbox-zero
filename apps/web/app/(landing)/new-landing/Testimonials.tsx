"use client";

import clsx from "clsx";
import Image from "next/image";
import { Section } from "@/app/(landing)/new-landing/Section";
import { Card } from "@/app/(landing)/new-landing/Card";
import { cva } from "class-variance-authority";
import { Paragraph } from "@/app/(landing)/new-landing/Typography";

type Testimonial = {
  body: string;
  author: {
    name: string;
    handle: string;
    imageUrl: string;
    logoUrl?: string;
  };
};

const featuredTestimonial = {
  body: "Loving it so far! Cleaned up my top cluttering newsletter and promotional email subscriptions in just a few minutes.",
  author: {
    name: "Jonni Lundy",
    handle: "Resend",
    imageUrl: "/images/testimonials/jonnilundy.jpg",
    logoUrl: "/images/logos/resend.svg",
  },
};

const stevenTestimonial: Testimonial = {
  body: "Love this new open-source app by @elie2222: getinboxzero.com",
  author: {
    name: "Steven Tey",
    handle: "Dub",
    imageUrl: "/images/testimonials/steventey.jpg",
  },
};

const vinayTestimonial: Testimonial = {
  body: "this is something I've been searching for a long time – thanks for building it.",
  author: {
    name: "Vinay Katiyar",
    handle: "@ktyr",
    imageUrl:
      "https://ph-avatars.imgix.net/2743360/28744c72-2267-49ed-999d-5bdab677ec28?auto=compress&codec=mozjpeg&cs=strip&auto=format&w=120&h=120&fit=crop&dpr=2",
  },
};

const yoniTestimonial: Testimonial = {
  body: "Wow. Onboarded and started unsubscribing from the worst spammers in just 3 minutes... Thank you 🙏🏼",
  author: {
    name: "Yoni Belson",
    handle: "LeadTrap",
    imageUrl: "/images/testimonials/yoni.jpeg",
  },
};

const slimTestimonial: Testimonial = {
  body: "I came across Inbox Zero while actively looking to hire a VA to manage my emails but after trying the tool, it turned out to be a complete game changer.",
  author: {
    name: "Slim Labassi",
    handle: "Boomgen",
    imageUrl: "/images/testimonials/slim.png",
  },
};

const willTestimonial: Testimonial = {
  body: "I love the flexibility and customization options, and it's the first thing in forever that's gotten my inbox under control. Thank you!",
  author: {
    name: "Will Brierly",
    handle: "DreamKey",
    imageUrl: "/images/testimonials/will.jpeg",
  },
};

const valentineTestimonial: Testimonial = {
  body: "I'm an executive who was drowning in hundreds of daily emails and heavily dependent on my EA for email management. What I love most about Inbox Zero is how it seamlessly replaced that entire function—the smart automation, prioritization, and organization features work like having a dedicated email assistant built right into my workflow.",
  author: {
    name: "Valentine Nwachukwu",
    handle: "Zaden Technologies",
    imageUrl: "/images/testimonials/valentine.png",
  },
};

const joelTestimonial: Testimonial = {
  body: "It's the first tool I've tried of many that have actually captured my voice in the responses that it drafts.",
  author: {
    name: "Joel Neuenhaus",
    handle: "Outbound Legal",
    imageUrl: "/images/testimonials/joel.jpeg",
  },
};

const alexTestimonial: Testimonial = {
  body: "SUPER excited for this one! Well done, going to get use out of it for sure—have been waiting for a tool like this, it just makes so much sense to have as a layer atop email.",
  author: {
    name: "Alex Bass",
    handle: "Efficient App",
    imageUrl:
      "https://ph-avatars.imgix.net/3523155/original?auto=compress&codec=mozjpeg&cs=strip&auto=format&w=120&h=120&fit=crop&dpr=2",
  },
};

const jamesTestimonial: Testimonial = {
  body: "hey bro, your tool is legit what I been looking for for ages haha. its a god send",
  author: {
    name: "James",
    handle: "@james",
    imageUrl: "/images/testimonials/midas-hofstra-a6PMA5JEmWE-unsplash.jpg",
  },
};

const steveTestimonial: Testimonial = {
  body: "I was mostly hoping to turn my email inbox into less of the mess that it is. I've been losing tasks that I should do as the emails get buried. So far it's really helped.",
  author: {
    name: "Steve Radabaugh",
    handle: "@stevenpaulr",
    imageUrl: "/images/home/testimonials/steve-rad.png",
  },
};

const wilcoTestimonial: Testimonial = {
  body: `Finally an "unsubscribe app" that let's you *actually* unsubscribe and filter using Gmail filters (instead of always relying on the 3rd party app to filter those emails). Big plus for me, so I have all filters in one place (inside the Gmail filters, that is). Awesome work! Already a fan :)`,
  author: {
    name: "Wilco de Kreij",
    handle: "@emarky",
    imageUrl:
      "https://ph-avatars.imgix.net/28450/8c4c8039-003a-4b3f-80ec-7035cedb6ac3?auto=compress&codec=mozjpeg&cs=strip&auto=format&w=120&h=120&fit=crop&dpr=2",
  },
};

const desktopTestimonials: Testimonial[][][] = [
  [
    [stevenTestimonial, joelTestimonial, willTestimonial, vinayTestimonial],
    [slimTestimonial, alexTestimonial],
  ],
  [
    [valentineTestimonial, steveTestimonial],
    [yoniTestimonial, wilcoTestimonial, jamesTestimonial],
  ],
];

const mobileTestimonials: Testimonial[] = [
  joelTestimonial,
  valentineTestimonial,
  stevenTestimonial,
  yoniTestimonial,
  slimTestimonial,
  alexTestimonial,
  willTestimonial,
];

export function Testimonials() {
  return (
    <Section
      title="Join thousands of others who spend less time on emails"
      subtitle="Our customers love saving time with inboxzero."
    >
      {/* Mobile */}
      <div className="grid gap-4 text-sm leading-6 text-gray-900 sm:hidden">
        {mobileTestimonials.map((testimonial) => (
          <TestimonialCard
            testimonial={testimonial}
            key={testimonial.author.name}
          />
        ))}
      </div>

      {/* Desktop */}
      <div className="hidden grid-cols-1 grid-rows-1 gap-8 text-sm leading-6 text-gray-900 sm:grid sm:grid-cols-2 xl:grid-flow-col xl:grid-cols-4">
        <TestimonialCard
          testimonial={featuredTestimonial}
          className="sm:col-span-2 xl:col-start-2 xl:row-end-1"
          variant="featured"
        />
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
                  <TestimonialCard
                    testimonial={testimonial}
                    key={testimonial.author.handle}
                  />
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
    </Section>
  );
}

function TestimonialCard({
  testimonial,
  variant = "default",
  className,
}: {
  testimonial: Testimonial;
  className?: string;
  variant?: "default" | "featured";
}) {
  const testimonialCardBody = cva("", {
    variants: {
      variant: {
        default: "text-gray-500",
        featured:
          "text-gray-700 text-lg font-semibold leading-7 tracking-tight",
      },
    },
  });

  return (
    <Card noPadding key={testimonial.author.handle} className={className}>
      <div className="p-5">
        <p className={testimonialCardBody({ variant })}>{testimonial.body}</p>
      </div>
      <div className="p-5 border-t border-[#E7E7E780] flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Image
            className="h-10 w-10 rounded-full bg-gray-50 border border-[#E7E7E780]"
            src={testimonial.author.imageUrl}
            alt=""
            width={40}
            height={40}
          />
          <div className="text-left">
            <p className="font-semibold">{testimonial.author.name}</p>
            {testimonial.author.handle ? (
              <Paragraph>{testimonial.author.handle}</Paragraph>
            ) : undefined}
          </div>
        </div>
        {variant === "featured" && testimonial.author.logoUrl ? (
          <Image
            className="h-8 w-auto flex-none"
            src={testimonial.author.logoUrl}
            alt=""
            height={32}
            width={98}
            unoptimized
          />
        ) : null}
      </div>
    </Card>
  );
}
