const { fontFamily } = require("tailwindcss/defaultTheme");

/** @type {import('tailwindcss').Config} */
/* eslint-disable max-len */
module.exports = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    transparent: "transparent",
    current: "currentColor",
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      transitionTimingFunction: {
        "back-out": "cubic-bezier(0.175, 0.885, 0.32, 2.2)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: 0 },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: 0 },
        },
        marquee: {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(calc(-200% - var(--gap)))" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        marquee: "marquee var(--duration) linear infinite",
        "marquee-reverse": "marquee-reverse var(--duration) linear infinite",
      },
      fontFamily: {
        sans: ["var(--font-geist)", ...fontFamily.sans],
        inter: ["var(--font-inter)", ...fontFamily.sans],
        title: ["var(--font-title)", ...fontFamily.sans],
      },
      colors: {
        // shadcn/ui
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive) / <alpha-value>)",
          foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        // TODO: rename
        new: {
          purple: {
            50: "#F3EAFE",
            100: "#E7DAFF",
            200: "#E1D5FC",
            300: "#D7C3FC",
            600: "#6410FF",
          },
          green: {
            50: "#F3FFEF",
            100: "#E1FFD8",
            150: "#DDF4D3",
            200: "#CFF4C0",
            500: "#30A24B",
            600: "#17A34A",
          },
          blue: {
            50: "#EFF6FF",
            100: "#D8E9FF",
            150: "#D6E8FC",
            200: "#C3DEFC",
            600: "#006EFF",
          },
          indigo: {
            50: "#EFF3FF",
            100: "#D9E2FF",
            150: "#D5DEFC",
            200: "#C2D0FC",
            600: "#124DFF",
          },
          pink: {
            50: "#FFEEF8",
            100: "#FFDAEC",
            150: "#FDD3EB",
            200: "#FDBFE0",
            500: "#C942B2",
          },
          orange: {
            50: "#FFF5EF",
            100: "#FFE7DA",
            150: "#FCE2D5",
            200: "#FCD6C2",
            600: "#E65707",
          },
          yellow: {
            50: "#FFFBEF",
            100: "#FFF3DA",
            150: "#E7E0CB",
            200: "#E7DBB9",
            500: "#D8A40C",
          },
          brown: {
            50: "#FEEDE0",
            100: "#F8E0CC",
            150: "#EFDFD3",
            200: "#E9D1BE",
            500: "#CC762F",
          },
          red: {
            50: "#FFEEF0",
            100: "#FFDADB",
            150: "#FDD3D4",
            200: "#FCC0C0",
            500: "#C94244",
          },
          cyan: {
            50: "#FEFFFF",
            100: "#E5F9FF",
            200: "#D0F4FF",
            500: "#49D1FA",
          },
          gray: {
            50: "#FFFFFF",
            100: "#F6F6F6",
            150: "#EEEEEE",
            200: "#E6E6E6",
            500: "#8E8E8E",
            600: "#525252",
          },
        },
      },
    },
  },
  safelist: [
    {
      pattern:
        /^(bg-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|100|200|300|400|500|600|700|800|900|950))$/,
      variants: ["hover", "ui-selected"],
    },
    {
      pattern:
        /^(text-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|100|200|300|400|500|600|700|800|900|950))$/,
      variants: ["hover", "ui-selected"],
    },
    {
      pattern:
        /^(border-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|100|200|300|400|500|600|700|800|900|950))$/,
      variants: ["hover", "ui-selected"],
    },
    {
      pattern:
        /^(ring-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|100|200|300|400|500|600|700|800|900|950))$/,
    },
    {
      pattern:
        /^(stroke-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|100|200|300|400|500|600|700|800|900|950))$/,
    },
    {
      pattern:
        /^(fill-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|100|200|300|400|500|600|700|800|900|950))$/,
    },
  ],
  plugins: [
    require("@tailwindcss/forms"),
    require("tailwindcss-animate"),
    require("@headlessui/tailwindcss"),
    require("@tailwindcss/typography"),
  ],
};
