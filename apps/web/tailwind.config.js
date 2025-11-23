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
        badge: {
          blue: {
            main: "#006EFF",
            "outer-from": "#D6E8FC",
            "outer-to": "#C3DEFC",
            "inner-from": "#EFF6FF",
            "inner-to": "#D8E9FF",
          },
          purple: {
            main: "#6410FF",
            "outer-from": "#E1D5FC",
            "outer-to": "#D7C3FC",
            "inner-from": "#F3EAFE",
            "inner-to": "#E7DAFF",
          },
          "dark-blue": {
            main: "#124DFF",
            "outer-from": "#D5DEFC",
            "outer-to": "#C2D0FC",
            "inner-from": "#EFF3FF",
            "inner-to": "#D9E2FF",
          },
          green: {
            main: "#17A34A",
            "outer-from": "#DDF4D3",
            "outer-to": "#CFF4C0",
            "inner-from": "#F3FFEF",
            "inner-to": "#E1FFD8",
          },
          yellow: {
            main: "#D8A40C",
            "outer-from": "#E7E0CB",
            "outer-to": "#E7DBB9",
            "inner-from": "#FFFBEF",
            "inner-to": "#FFF3DA",
          },
          brown: {
            main: "#CC762F",
            "outer-from": "#EFDFD3",
            "outer-to": "#E9D1BE",
            "inner-from": "#FEEDE0",
            "inner-to": "#F8E0CC",
          },
          red: {
            main: "#C94244",
            "outer-from": "#FDD3D4",
            "outer-to": "#FCC0C0",
            "inner-from": "#FFEEF0",
            "inner-to": "#FFDADB",
          },
          "light-blue": {
            main: "#49D1FA",
            "outer-from": "#E5F9FF",
            "outer-to": "#D0F4FF",
            "inner-from": "#FEFFFF",
            "inner-to": "#E5F9FF",
          },
          orange: {
            main: "#E65707",
            "outer-from": "#FCE2D5",
            "outer-to": "#FCD6C2",
            "inner-from": "#FFF5EF",
            "inner-to": "#FFE7DA",
          },
          pink: {
            main: "#C942B2",
            "outer-from": "#FDD3EB",
            "outer-to": "#FDBFE0",
            "inner-from": "#FFEEF8",
            "inner-to": "#FFDAEC",
          },
          gray: {
            main: "#8E8E8E",
            "outer-from": "#EEEEEE",
            "outer-to": "#E6E6E6",
            "inner-from": "#FFFFFF",
            "inner-to": "#F6F6F6",
          },
          "dark-gray": {
            main: "#525252",
            "outer-from": "#EEEEEE",
            "outer-to": "#E6E6E6",
            "inner-from": "#FFFFFF",
            "inner-to": "#F6F6F6",
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
