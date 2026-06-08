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
          gold: "#f5b942",
          mint: "#34d399",
        },
        surface: {
          DEFAULT: "#ffffff",
          muted: "#f6f8fb",
          subtle: "#f1f4f9",
        },
      },
      boxShadow: {
        card: "0 1px 0 rgba(15, 23, 42, 0.04), 0 8px 24px rgba(15, 23, 42, 0.06)",
        soft: "0 1px 2px rgba(15, 23, 42, 0.04), 0 12px 32px rgba(15, 23, 42, 0.08)",
        brand: "0 10px 28px -8px rgba(30, 142, 225, 0.55)",
        glow: "0 0 40px -8px rgba(30, 142, 225, 0.35)",
        "glow-emerald": "0 0 40px -8px rgba(52, 211, 153, 0.45)",
        "glow-violet": "0 0 40px -8px rgba(139, 92, 246, 0.35)",
        elevated: "0 24px 48px -12px rgba(15, 23, 42, 0.18)",
        glass: "0 8px 32px rgba(15, 23, 42, 0.08), inset 0 1px 0 rgba(255,255,255,0.6)",
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(135deg, #1e8ee1 0%, #22c4d4 100%)",
        "brand-gradient-soft": "linear-gradient(135deg, rgba(30,142,225,0.14), rgba(34,196,212,0.10))",
        "success-gradient": "linear-gradient(135deg, #10b981 0%, #22c4d4 100%)",
        "warm-gradient": "linear-gradient(135deg, #f59e0b 0%, #f97316 100%)",
        "violet-gradient": "linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)",
        "mesh-light":
          "radial-gradient(at 40% 20%, rgba(30,142,225,0.12) 0px, transparent 50%), radial-gradient(at 80% 0%, rgba(34,196,212,0.10) 0px, transparent 50%), radial-gradient(at 0% 50%, rgba(139,92,246,0.08) 0px, transparent 50%), radial-gradient(at 80% 80%, rgba(245,185,66,0.08) 0px, transparent 50%)",
        "mesh-dark":
          "radial-gradient(at 40% 20%, rgba(30,142,225,0.18) 0px, transparent 50%), radial-gradient(at 80% 0%, rgba(34,196,212,0.12) 0px, transparent 50%), radial-gradient(at 0% 50%, rgba(139,92,246,0.12) 0px, transparent 50%)",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pop-in": {
          "0%": { opacity: "0", transform: "scale(0.94)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "slide-in-right": {
          "0%": { opacity: "0", transform: "translateX(24px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-8px)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "glow-pulse": {
          "0%, 100%": { opacity: "0.6", transform: "scale(1)" },
          "50%": { opacity: "1", transform: "scale(1.05)" },
        },
        "celebrate-pop": {
          "0%": { opacity: "0", transform: "scale(0.5)" },
          "50%": { opacity: "1", transform: "scale(1.08)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "spin-slow": {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        wiggle: {
          "0%, 100%": { transform: "rotate(-3deg)" },
          "50%": { transform: "rotate(3deg)" },
        },
      },
      animation: {
        "fade-in": "fade-in 320ms ease-out both",
        "fade-in-up": "fade-in-up 400ms ease-out both",
        "pop-in": "pop-in 240ms ease-out both",
        "slide-in-right": "slide-in-right 320ms ease-out both",
        float: "float 5s ease-in-out infinite",
        shimmer: "shimmer 2.5s linear infinite",
        "glow-pulse": "glow-pulse 2.5s ease-in-out infinite",
        "celebrate-pop": "celebrate-pop 500ms cubic-bezier(0.34, 1.56, 0.64, 1) both",
        "spin-slow": "spin-slow 8s linear infinite",
        wiggle: "wiggle 0.5s ease-in-out 2",
      },
    },
  },
  plugins: [],
};
export default config;
