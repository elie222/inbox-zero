import { NextResponse } from "next/server";
import { contactCardExchangeBody } from "@/utils/actions/contact-card.validation";
import { submitContactCardExchange } from "@/utils/contact-card/exchange";
import { withError } from "@/utils/middleware";

// Public, unauthenticated: the Exchange tab on someone's card. The submission
// is stored for the card owner to review — it never becomes a contact here.
export const POST = withError(
  "contact-card-exchange",
  async (request, context) => {
    const { slug } = await context.params;
    const submission = contactCardExchangeBody.parse(await request.json());

    const result = await submitContactCardExchange({
      slug,
      submission,
      headers: request.headers,
      logger: request.logger,
    });

    return NextResponse.json(result);
  },
);
