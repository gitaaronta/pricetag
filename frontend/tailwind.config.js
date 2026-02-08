/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Costco-inspired colors
        'costco-red': '#E31837',
        'costco-blue': '#005DAA',
        // Decision colors
        'buy-now': '#16A34A',      // green-600
        'ok-price': '#CA8A04',     // yellow-600
        'wait': '#DC2626',         // red-600
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
