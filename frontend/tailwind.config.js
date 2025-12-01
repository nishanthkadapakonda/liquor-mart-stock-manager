import forms from "@tailwindcss/forms";

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f5f7ff",
          100: "#e6edff",
          200: "#c2d3ff",
          300: "#94b0ff",
          400: "#6284ff",
          500: "#3b5bff",
          600: "#2a45db",
          700: "#2236aa",
          800: "#1d2f85",
          900: "#1c2b6b",
        },
      },
    },
  },
  plugins: [forms],
};

