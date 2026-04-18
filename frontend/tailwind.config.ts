import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        brand: {
          50: "#eefaff",
          100: "#daf1ff",
          200: "#b8e5ff",
          300: "#85d1fe",
          400: "#4cb6fa",
          500: "#2196f0",
          600: "#147ace",
          700: "#1162a7",
          800: "#135289",
          900: "#144572",
          DEFAULT: "#1e8ee1",
          foreground: "#ffffff",
        },
        accent: {
          cyan: "#22c4d4",
          teal: "#12b3b8",
        },
        surface: {
          DEFAULT: "#ffffff",
          muted: "#f6f8fb",
          subtle: "#f1f4f9",
        },
      },
      boxShadow: {
        card: "0 1px 0 rgba(15, 23, 42, 0.04), 0 8px 24px rgba(15, 23, 42, 0.05)",
        soft: "0 1px 2px rgba(15, 23, 42, 0.04), 0 6px 18px rgba(15, 23, 42, 0.06)",
        brand: "0 10px 24px -8px rgba(30, 142, 225, 0.55)",
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(135deg, #1e8ee1 0%, #22c4d4 100%)",
        "brand-gradient-soft": "linear-gradient(135deg, rgba(30,142,225,0.12), rgba(34,196,212,0.10))",
      },
      keyframes: {
        "fade-in": { "0%": { opacity: "0", transform: "translateY(6px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
        "pop-in": { "0%": { opacity: "0", transform: "scale(.96)" }, "100%": { opacity: "1", transform: "scale(1)" } },
      },
      animation: {
        "fade-in": "fade-in 240ms ease-out both",
        "pop-in": "pop-in 200ms ease-out both",
      },
    },
  },
  plugins: [],
};
export default config;
