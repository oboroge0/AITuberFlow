import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'editor-bg': '#0F172A',
        'editor-bg-light': '#1E293B',
        'panel-bg': 'rgba(17, 24, 39, 0.95)',
        'node-bg': 'rgba(0, 0, 0, 0.3)',
        'accent': '#10B981',
        'accent-blue': '#3B82F6',
        'accent-red': '#EF4444',
        'accent-yellow': '#F59E0B',
        'accent-pink': '#EC4899',
        'accent-purple': '#9146FF',
      },
      backgroundImage: {
        'gradient-main': 'linear-gradient(135deg, #0F172A 0%, #1E293B 50%, #0F172A 100%)',
        'gradient-accent': 'linear-gradient(135deg, #10B981, #3B82F6)',
      },
    },
  },
  plugins: [],
}
export default config
