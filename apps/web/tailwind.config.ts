import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        slate: {
          950: "#051018",
          900: "#0b1a24",
          800: "#102b3a",
          700: "#1a4355",
        },
        brand: {
          50: "#ecfeff",
          100: "#cffafe",
          200: "#a5f3fc",
          300: "#7de8ff",
          400: "#28c7ec",
          500: "#14b8de",
          600: "#0786ad",
          700: "#0e7490",
          800: "#155e75",
          900: "#164e63"
        },
        ink: "#f8fbff",
        "ink-dim": "#a7c2cf",
        danger: "#fb7185"
      },
      fontFamily: {
        display: ["-apple-system", "BlinkMacSystemFont", "Segoe UI", "Noto Sans", "Helvetica", "Arial", "sans-serif"],
        body: ["-apple-system", "BlinkMacSystemFont", "Segoe UI", "Noto Sans", "Helvetica", "Arial", "sans-serif"]
      },
      boxShadow: {
        plate: "0 20px 56px rgba(0, 0, 0, 0.3)",
        xl: "0 26px 72px rgba(0, 0, 0, 0.38)",
        glow: "0 0 0 3px rgba(20, 184, 222, 0.22), 0 0 30px rgba(20, 184, 222, 0.18)"
      },
      animation: {
        "fadeInUp": "fadeInUp 0.6s ease-out",
        "fadeInDown": "fadeInDown 0.6s ease-out",
        "slideInLeft": "slideInLeft 0.6s ease-out",
        "slideInRight": "slideInRight 0.6s ease-out",
        "pulse-glow": "pulse-glow 2s ease-in-out infinite"
      },
      keyframes: {
        fadeInUp: {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        },
        fadeInDown: {
          "0%": { opacity: "0", transform: "translateY(-20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        },
        slideInLeft: {
          "0%": { opacity: "0", transform: "translateX(-30px)" },
          "100%": { opacity: "1", transform: "translateX(0)" }
        },
        slideInRight: {
          "0%": { opacity: "0", transform: "translateX(30px)" },
          "100%": { opacity: "1", transform: "translateX(0)" }
        },
        "pulse-glow": {
          "0%, 100%": { boxShadow: "0 0 22px rgba(20, 184, 222, 0.34)" },
          "50%": { boxShadow: "0 0 46px rgba(125, 232, 255, 0.48)" }
        }
      },
      backdropBlur: {
        xs: "2px"
      }
    }
  },
  plugins: []
} satisfies Config;
