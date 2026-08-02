import { Body, Head, Html, Img, Preview } from "@react-email/components";

type SuggestedSender = {
  name: string;
  email: string;
  count: number;
  readEmails: number;
  ignoredEmails: number;
};

export interface InboxHealthEmailProps {
  baseUrl: string;
  emailAccountId: string;
  senders: SuggestedSender[];
  suggestionCount: number;
  unsubscribeToken: string;
  weeklyIgnoredEmails: number;
  yearlyEmailsAvoided: number;
}

const ICON_URL = "https://www.getinboxzero.com/icon.png";
const FONT_STACK = "'Helvetica Neue',Helvetica,Arial,sans-serif";
const PAGE_BACKGROUND = "#F1F1EE";
const CARD_BACKGROUND = "#FDFDFD";
const BORDER = "#EFEFEF";
const TEXT = "#242424";
const TEXT_MUTED = "#5C5C5C";
const TEXT_SUBTLE = "#8C8C8C";
const TEXT_FAINT = "#9A9A9A";
const ACCENT = "#2965EC";
const ACCENT_LINK = "#2563EB";
const BAR_TRACK = "#F0F0EE";

const MOBILE_STYLES = `
  a{text-decoration:none;}
  @media only screen and (max-width:620px){
    .px{padding-left:24px !important;padding-right:24px !important;}
    .h1{font-size:28px !important;line-height:34px !important;}
    .stack{display:block !important;width:100% !important;text-align:left !important;padding-bottom:0 !important;}
    .stack-r{display:block !important;width:100% !important;text-align:left !important;padding-top:6px !important;}
    .btn a{display:block !important;}
  }
`;

export default function InboxHealthEmail(props: InboxHealthEmailProps) {
  const {
    baseUrl = "https://www.getinboxzero.com",
    emailAccountId,
    unsubscribeToken,
    suggestionCount,
    weeklyIgnoredEmails,
    yearlyEmailsAvoided,
    senders,
  } = props;

  const bulkUnsubscribeUrl = `${baseUrl}/${emailAccountId}/bulk-unsubscribe?filter=suggested`;
  const senderCountText = getSenderCountText(suggestionCount);
  const yearlyText = yearlyEmailsAvoided.toLocaleString("en-US");
  const remainingCount = suggestionCount - senders.length;
  // Longest bar is the sender whose email you ignore most, so the rest read
  // as a share of that
  const maxIgnored = Math.max(...senders.map((sender) => sender.ignoredEmails));

  return (
    <Html lang="en">
      <Head>
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
        <style>{MOBILE_STYLES}</style>
      </Head>
      <Preview>
        Unsubscribing from these {senderCountText} could save you about{" "}
        {yearlyText} emails a year.
      </Preview>
      <Body style={{ margin: 0, padding: 0, backgroundColor: PAGE_BACKGROUND }}>
        <table
          role="presentation"
          cellPadding={0}
          cellSpacing={0}
          border={0}
          width="100%"
          style={{ backgroundColor: PAGE_BACKGROUND }}
        >
          <tr>
            <td align="center" style={{ padding: "32px 12px 48px 12px" }}>
              <table
                role="presentation"
                cellPadding={0}
                cellSpacing={0}
                border={0}
                width={600}
                style={{ width: "600px", maxWidth: "600px" }}
              >
                <tr>
                  <td align="left" style={{ padding: "0 8px 18px 8px" }}>
                    <table
                      role="presentation"
                      cellPadding={0}
                      cellSpacing={0}
                      border={0}
                    >
                      <tr>
                        <td
                          style={{
                            paddingRight: "8px",
                            verticalAlign: "middle",
                          }}
                        >
                          {/* Decorative: the adjacent link already names the
                          brand, so linking the icon too would add a second
                          unlabelled link to the same place */}
                          <Img
                            src={ICON_URL}
                            width="22"
                            height="22"
                            alt=""
                            style={{ display: "block", border: 0 }}
                          />
                        </td>
                        <td
                          style={{
                            fontFamily: FONT_STACK,
                            fontSize: "17px",
                            lineHeight: "22px",
                            letterSpacing: "-0.02em",
                            color: TEXT,
                            fontWeight: 600,
                            verticalAlign: "middle",
                          }}
                        >
                          <a href={baseUrl} style={{ color: TEXT }}>
                            Inbox Zero
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td
                    align="right"
                    style={{
                      padding: "0 8px 18px 8px",
                      fontFamily: FONT_STACK,
                      fontSize: "12px",
                      lineHeight: "20px",
                      color: TEXT_SUBTLE,
                    }}
                  >
                    Monthly inbox report
                  </td>
                </tr>
              </table>

              <table
                role="presentation"
                cellPadding={0}
                cellSpacing={0}
                border={0}
                width={600}
                style={{
                  width: "600px",
                  maxWidth: "600px",
                  backgroundColor: CARD_BACKGROUND,
                  border: `1px solid ${BORDER}`,
                  borderRadius: "24px",
                }}
              >
                <tr>
                  <td
                    className="px"
                    style={{
                      padding: "44px 40px 0 40px",
                      fontFamily: FONT_STACK,
                    }}
                  >
                    <div
                      style={{
                        fontSize: "12px",
                        lineHeight: "16px",
                        color: ACCENT_LINK,
                        fontWeight: 600,
                        paddingBottom: "14px",
                      }}
                    >
                      Rarely Read Senders
                    </div>
                    <h1
                      className="h1"
                      style={{
                        margin: 0,
                        fontSize: "32px",
                        lineHeight: "38px",
                        letterSpacing: "-0.02em",
                        color: TEXT,
                        fontWeight: 500,
                        msoLineHeightRule: "exactly",
                      }}
                    >
                      We found {senderCountText} you rarely read
                    </h1>
                    <p
                      style={{
                        margin: "14px 0 0 0",
                        fontSize: "16px",
                        lineHeight: "25px",
                        color: TEXT_MUTED,
                        msoLineHeightRule: "exactly",
                      }}
                    >
                      Unsubscribing from them could save you around{" "}
                      <span style={{ color: TEXT, fontWeight: 600 }}>
                        {yearlyText} emails a year
                      </span>
                      . That&rsquo;s about {weeklyIgnoredEmails} a week you
                      never open.
                    </p>
                  </td>
                </tr>

                <tr>
                  <td className="px" style={{ padding: "26px 40px 34px 40px" }}>
                    <table
                      role="presentation"
                      cellPadding={0}
                      cellSpacing={0}
                      border={0}
                      className="btn"
                    >
                      <tr>
                        <td
                          bgcolor={ACCENT}
                          style={{
                            borderRadius: "13px",
                            backgroundColor: ACCENT,
                            backgroundImage: `linear-gradient(180deg,${ACCENT} 0%,#5C89F8 100%)`,
                          }}
                        >
                          <a
                            href={bulkUnsubscribeUrl}
                            style={{
                              display: "inline-block",
                              padding: "14px 26px",
                              fontFamily: FONT_STACK,
                              fontSize: "15px",
                              lineHeight: "20px",
                              fontWeight: 600,
                              color: "#FFFFFF",
                              borderRadius: "13px",
                              msoLineHeightRule: "exactly",
                            }}
                          >
                            Unsubscribe in one click
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td className="px" style={{ padding: "0 40px" }}>
                    <table
                      role="presentation"
                      cellPadding={0}
                      cellSpacing={0}
                      border={0}
                      width="100%"
                      style={{
                        width: "100%",
                        borderTop: `1px solid ${BORDER}`,
                      }}
                    >
                      <tr>
                        <td align="left" style={listHeadingStyle}>
                          Top {senders.length}, worst first
                        </td>
                        <td align="right" style={listHeadingStyle}>
                          Last 3 months
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td className="px" style={{ padding: "0 40px" }}>
                    <table
                      role="presentation"
                      cellPadding={0}
                      cellSpacing={0}
                      border={0}
                      width="100%"
                      style={{ width: "100%" }}
                    >
                      {senders.map((sender) => (
                        <SenderRow
                          key={sender.email}
                          sender={sender}
                          maxIgnored={maxIgnored}
                        />
                      ))}
                    </table>
                  </td>
                </tr>

                <tr>
                  <td
                    className="px"
                    style={{
                      padding:
                        remainingCount > 0
                          ? "26px 40px 40px 40px"
                          : "0 40px 40px 40px",
                    }}
                  >
                    {remainingCount > 0 && (
                      <table
                        role="presentation"
                        cellPadding={0}
                        cellSpacing={0}
                        border={0}
                        width="100%"
                        style={{
                          width: "100%",
                          borderTop: `1px solid ${BORDER}`,
                        }}
                      >
                        <tr>
                          <td
                            style={{
                              padding: "20px 0 0 0",
                              fontFamily: FONT_STACK,
                              fontSize: "14px",
                              lineHeight: "22px",
                              color: TEXT_MUTED,
                            }}
                          >
                            {getRemainingSendersText(remainingCount)}{" "}
                            <a
                              href={bulkUnsubscribeUrl}
                              style={{ color: ACCENT_LINK, fontWeight: 600 }}
                            >
                              Review all {suggestionCount} &rarr;
                            </a>
                          </td>
                        </tr>
                      </table>
                    )}
                  </td>
                </tr>
              </table>

              <table
                role="presentation"
                cellPadding={0}
                cellSpacing={0}
                border={0}
                width={600}
                style={{ width: "600px", maxWidth: "600px" }}
              >
                <tr>
                  <td
                    style={{
                      padding: "24px 48px 0 48px",
                      fontFamily: FONT_STACK,
                      fontSize: "12px",
                      lineHeight: "20px",
                      color: "#A0A0A0",
                      textAlign: "center",
                    }}
                  >
                    You&rsquo;re receiving this because you subscribed to Inbox
                    Zero stats updates.
                    <br />
                    <a
                      href={`${baseUrl}/settings#email-updates`}
                      style={footerLinkStyle}
                    >
                      Change email settings
                    </a>
                    &nbsp;&middot;&nbsp;
                    <a
                      href={`${baseUrl}/api/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`}
                      style={footerLinkStyle}
                    >
                      Unsubscribe from these updates
                    </a>
                  </td>
                </tr>
                <tr>
                  <td
                    style={{
                      padding: "14px 48px 0 48px",
                      fontFamily: FONT_STACK,
                      fontSize: "12px",
                      lineHeight: "18px",
                      color: "#B4B4B4",
                      textAlign: "center",
                    }}
                  >
                    Inbox Zero &middot; 1111B S Governors Ave, STE 29390, Dover,
                    DE 19904, United States
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </Body>
    </Html>
  );
}

InboxHealthEmail.PreviewProps = {
  baseUrl: "https://www.getinboxzero.com",
  emailAccountId: "email-account-id",
  unsubscribeToken: "123",
  suggestionCount: 14,
  yearlyEmailsAvoided: 1248,
  weeklyIgnoredEmails: 22,
  senders: [
    {
      name: "Daily Deals",
      email: "deals@shopping.example.com",
      count: 92,
      readEmails: 2,
      ignoredEmails: 90,
    },
    {
      name: "Tech Newsletter",
      email: "newsletter@technews.example.com",
      count: 64,
      readEmails: 5,
      ignoredEmails: 59,
    },
    {
      name: "Promo Updates",
      email: "promo@retailer.example.com",
      count: 48,
      readEmails: 0,
      ignoredEmails: 48,
    },
    {
      name: "Webinar Invites",
      email: "events@saas.example.com",
      count: 35,
      readEmails: 4,
      ignoredEmails: 31,
    },
    {
      name: "Job Alerts",
      email: "alerts@jobs.example.com",
      count: 26,
      readEmails: 3,
      ignoredEmails: 23,
    },
  ],
} satisfies InboxHealthEmailProps;

const listHeadingStyle = {
  padding: "16px 0 4px 0",
  fontFamily: FONT_STACK,
  fontSize: "12px",
  lineHeight: "16px",
  color: TEXT_SUBTLE,
} as const;

const footerLinkStyle = {
  color: TEXT_SUBTLE,
  textDecoration: "underline",
} as const;

const senderCellStyle = {
  padding: "15px 0 13px 0",
  fontFamily: FONT_STACK,
  verticalAlign: "top",
} as const;

function SenderRow({
  sender,
  maxIgnored,
}: {
  sender: SuggestedSender;
  maxIgnored: number;
}) {
  const filledPercentage = getBarPercentage(sender.ignoredEmails, maxIgnored);

  return (
    <>
      <tr>
        <td
          className="stack"
          width={320}
          style={{ ...senderCellStyle, width: "320px" }}
        >
          <div
            style={{
              fontSize: "15px",
              lineHeight: "20px",
              color: TEXT,
              fontWeight: 600,
            }}
          >
            {sender.name || sender.email}
          </div>
          <div
            style={{
              fontSize: "13px",
              lineHeight: "18px",
              color: TEXT_FAINT,
              paddingTop: "2px",
            }}
          >
            {sender.email}
          </div>
        </td>
        <td
          className="stack-r"
          width={200}
          align="right"
          style={{ ...senderCellStyle, width: "200px" }}
        >
          <div
            style={{
              fontSize: "15px",
              lineHeight: "20px",
              color: TEXT,
              fontWeight: 600,
            }}
          >
            {sender.count} {sender.count === 1 ? "email" : "emails"}
          </div>
          <div
            style={{
              fontSize: "13px",
              lineHeight: "18px",
              color: TEXT_FAINT,
              paddingTop: "2px",
            }}
          >
            {getOpenedText(sender)}
          </div>
        </td>
      </tr>
      <tr>
        <td colSpan={2} style={{ padding: 0 }}>
          <table
            role="presentation"
            cellPadding={0}
            cellSpacing={0}
            border={0}
            width="100%"
            style={{ width: "100%", tableLayout: "fixed" }}
          >
            <tr>
              <td
                width={`${filledPercentage}%`}
                height={3}
                bgcolor={ACCENT}
                style={{
                  width: `${filledPercentage}%`,
                  height: "3px",
                  backgroundColor: ACCENT,
                  borderRadius: "1.5px",
                  fontSize: 0,
                  lineHeight: 0,
                }}
              >
                &nbsp;
              </td>
              {filledPercentage < 100 && (
                <td
                  width={`${100 - filledPercentage}%`}
                  height={3}
                  bgcolor={BAR_TRACK}
                  style={{
                    width: `${100 - filledPercentage}%`,
                    height: "3px",
                    backgroundColor: BAR_TRACK,
                    fontSize: 0,
                    lineHeight: 0,
                  }}
                >
                  &nbsp;
                </td>
              )}
            </tr>
          </table>
        </td>
      </tr>
    </>
  );
}

export function getSenderCountText(count: number) {
  return `${count} ${count === 1 ? "sender" : "senders"}`;
}

function getRemainingSendersText(count: number) {
  return count === 1
    ? "1 more sender sends you email you rarely open."
    : `${count} more senders send you email you rarely open.`;
}

/**
 * "opened 1 in 8" reads faster than a read percentage, and stays honest for
 * senders the user has never opened.
 */
function getOpenedText(sender: SuggestedSender) {
  if (sender.readEmails <= 0) return "opened none";
  return `opened 1 in ${Math.round(sender.count / sender.readEmails)}`;
}

function getBarPercentage(ignoredEmails: number, maxIgnored: number) {
  if (maxIgnored <= 0) return 100;
  return Math.round((ignoredEmails / maxIgnored) * 1000) / 10;
}
