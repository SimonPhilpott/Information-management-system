/** @type {import('tailwindcss').Config} */
export default {
  // dark: styles follow IMS's own light / dark switch (the 'dark' class it sets on <html>), not the computer's setting
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          cyan: '#00f2ff',
          purple: '#bf00ff',
          void: '#02040a',
        }
      },
      fontFamily: {
        outfit: ['Outfit', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      }
    },
  },
  plugins: [],
}
