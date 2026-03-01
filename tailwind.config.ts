import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./packages/ui/app/**/*.{ts,tsx}",
    "./packages/ui/components/**/*.{ts,tsx}",
    "./packages/ui/lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#111215",
        panel: "#171a1f",
        border: "#2c323d",
        text: "#e6e9ee",
        muted: "#8a93a6",
      },
      fontFamily: {
        mono: ["JetBrains Mono", "Consolas", "monospace"],
        sans: ["IBM Plex Sans", "Segoe UI", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
