import {
  Instrument_Serif,
  JetBrains_Mono,
  Space_Grotesk,
} from "next/font/google";

// Self-hosted by next/font so the public card never calls out to Google at
// runtime. Scoped to this route because nothing else in the app uses them.
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

// The "Serif" name style option — the same face the app's headings use
const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-card-serif",
  display: "swap",
});

export default function ContactCardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className={`${spaceGrotesk.variable} ${jetbrainsMono.variable} ${instrumentSerif.variable}`}
    >
      {children}
    </div>
  );
}
