import { after } from "next/server";
import { generateVCard } from "@/utils/carddav/vcard";
import { getPublicContactCard } from "@/utils/contact-card/public";
import { recordContactCardClick } from "@/utils/contact-card/views";
import { withError } from "@/utils/middleware";

// Public: "Save to contacts" on the card page. Same vCard generator the
// CardDAV server uses, so what lands in Contacts matches what syncs.
export const GET = withError("contact-card-vcard", async (request, context) => {
  const { slug } = await context.params;
  const card = await getPublicContactCard(slug);

  // The download itself is the "save" signal — more reliable than a
  // beacon racing the navigation
  after(() =>
    recordContactCardClick({
      slug,
      kind: "save",
      headers: request.headers,
      logger: request.logger,
    }),
  );

  const vcard = generateVCard({
    uid: card.id,
    email: card.email,
    name: card.displayName,
    phones: card.phone ? [{ label: "Mobile", value: card.phone }] : [],
    title: card.title,
    companyName: card.companyName,
    updatedAt: new Date(),
  });

  return new Response(vcard, {
    headers: {
      "Content-Type": "text/vcard; charset=utf-8",
      "Content-Disposition": `attachment; filename="${card.slug}.vcf"`,
    },
  });
});
