import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        slate: {
          950: "#0f172a",
          900: "#1a2847",
          800: "#252d4a",
          700: "#2c3659",
        },
        brand: {
          50: "#e0e7ff",
          100: "#c7d2fe",
          500: "#6366f1",
          600: "#4f46e5",
          700: "#4338ca",
          900: "#312e81"
        },
        ink: "#f1f5f9",
        "ink-dim": "#cbd5e1"
      },
      fontFamily: {
        display: ["Montserrat", "sans-serif"],
        body: ["Poppins", "Nunito Sans", "sans-serif"]
      },
      boxShadow: {
        plate: "0 10px 30px rgba(11, 46, 89, 0.15)",
        xl: "0 20px 40px rgba(0, 0, 0, 0.3)",
        glow: "0 0 20px rgba(99, 102, 241, 0.5)"
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
          "0%, 100%": { boxShadow: "0 0 20px rgba(99, 102, 241, 0.5)" },
          "50%": { boxShadow: "0 0 40px rgba(99, 102, 241, 0.8)" }
        }
      },
      backdropBlur: {
        xs: "2px"
      }
    }
  },
  plugins: []
} satisfies Config;
