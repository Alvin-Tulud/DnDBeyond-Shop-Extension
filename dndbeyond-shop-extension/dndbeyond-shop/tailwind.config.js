/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./popup.html", "./js/**/*.js"],
  darkMode: "class", // toggled via popup.js's applyTheme() adding/removing .dark on <html>, not OS prefers-color-scheme
  theme: {
    extend: {
      colors: {
        beyond: {
          red: "#8B0000",
          crimson: "#B01C2E",
          gold: "#D4AF37",
          parchment: "#F5EEDD",
          ink: "#1F1B16"
        }
      },
      fontFamily: {
        display: ["'Cinzel'", "serif"],
        body: ["'Inter'", "system-ui", "sans-serif"]
      }
    }
  },
  plugins: []
};
