/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'accent-purple': '#8C3BFE',
        'accent-teal': '#10B981', // Neon green/teal hybrid for results
      },
    },
  },
  plugins: [],
}
