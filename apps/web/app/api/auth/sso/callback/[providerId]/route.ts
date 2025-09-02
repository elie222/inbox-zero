import { type NextRequest, NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { validateAndExtractUserInfoFromSAML } from "@/utils/saml";
import crypto from "node:crypto";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const samlResponseBase64 = (formData.get("SAMLResponse") as string) || "";
    const samlResponseXml = Buffer.from(samlResponseBase64, "base64").toString(
      "utf-8",
    );

    const expectedCert = process.env.OKTA_CERT_TEST_ORG; // TODO: Save this certificate somewhere
    if (!expectedCert) {
      throw new Error("SAML certificate not configured");
    }

    // Debug: Log the entire SAML XML
    console.log("Full SAML Response XML:", samlResponseXml);

    const userInfo = validateAndExtractUserInfoFromSAML(
      samlResponseXml,
      expectedCert,
    );

    // TODO: Decide what to do from here as the user has been authenticated on Okta's end
    // An user without an account can end up here.
    let user = await prisma.user.findUnique({
      where: { email: userInfo.email },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: userInfo.email,
          name: userInfo.name,
          emailVerified: true,
        },
      });
    }

    const sessionToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 60 * 60 * 24 * 30 * 1000);

    await prisma.session.create({
      data: {
        sessionToken,
        userId: user.id,
        expires: expiresAt,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    const relayState = (formData.get("RelayState") as string) || "/welcome";
    const redirectUrl = new URL(relayState, request.url);

    const response = NextResponse.redirect(redirectUrl);

    response.cookies.set("better-auth.session_token", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      {
        error: "SAML SSO callback failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
