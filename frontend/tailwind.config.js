/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "#f8fafc",
          card: "#ffffff",
          hover: "#f1f5f9",
          border: "#e2e8f0",
        },
        accent: {
          DEFAULT: "#4f46e5",
          hover: "#4338ca",
          muted: "#e0e7ff",
        },
        priority: {
          high: "#dc2626",
          medium: "#d97706",
          low: "#16a34a",
        },
        status: {
          processing: "#7c3aed",
          awaiting: "#0284c7",
          complete: "#16a34a",
          error: "#dc2626",
        },
        "text-primary": "#0f172a",
        "text-secondary": "#475569",
        "text-muted": "#94a3b8",
      },
    },
  },
  plugins: [],
};
