import "../styles/globals.css";
import { Inter } from "next/font/google";
import localFont from "next/font/local";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  preload: true,
  display: "swap",
});
const calFont = localFont({
  src: "../styles/CalSans-SemiBold.otf",
  variable: "--font-cal",
  preload: true,
  display: "swap",
});

export const metadata = {
  title: "Inbox Zero AI",
  description:
    "Handle emails fast with AI assistance. Automate replies and archiving. Inbox Zero is your virtual assistant for emails.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body
        className={`h-full ${inter.variable} ${calFont.variable} font-sans`}
      >
        {children}
      </body>
    </html>
  );
}
