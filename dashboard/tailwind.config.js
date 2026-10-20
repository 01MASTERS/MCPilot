/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        geist: {
          canvas: "#000000",
          card: "#0A0A0A",
          elevated: "#111111",
          hover: "#141414",
          border: "#222222",
          "border-subtle": "#1A1A1A",
          "border-strong": "#333333",
          text: "#EDEDED",
          muted: "#888888",
          subtle: "#555555",
          accent: "#00DF8F",
          danger: "#EE0000",
          warning: "#F5A623",
          blue: "#0070F3",
        },
      },
      fontFamily: {
        sans: ["'IBM Plex Sans'", "'Inter'", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
      boxShadow: {
        geist: "0 0 0 1px #222222",
        "geist-elevated": "0 8px 30px rgba(0, 0, 0, 0.8), 0 0 0 1px #333333",
      },
    },
  },
  plugins: [],
};
