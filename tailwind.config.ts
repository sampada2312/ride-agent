import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#14213d",
        sand: "#f8f1e7",
        ember: "#f97316",
        moss: "#7a8b5b",
        dusk: "#334155"
      },
      fontFamily: {
        display: ['"Iowan Old Style"', '"Palatino Linotype"', "Georgia", "serif"],
        body: ['"Avenir Next"', '"Segoe UI"', "sans-serif"]
      },
      boxShadow: {
        panel: "0 20px 60px rgba(20, 33, 61, 0.12)"
      }
    }
  },
  plugins: []
};

export default config;
