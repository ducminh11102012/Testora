import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ielts: {
          red: '#E31837',
          redDark: '#C4142E',
          banner: '#F1F2EC',
          mint: '#DAEDE9',
          mintTrack: '#F4FBF9',
          rule: '#D7D7D7',
          divider: '#999999',
          ink: '#1E1E1E',
          muted: '#5E5E5E',
          blue: '#0059B3',
          blueDark: '#00478F',
          select: '#084BAF',
          warn: '#FFFCF0',
          warnBorder: '#EFE3B0',
          panel: '#EFEFEF',
          border: '#C1C1C1',
          highlight: '#FFE799',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
      boxShadow: {
        pop: '0 2px 10px rgba(0,0,0,0.22)',
        panel: '0 -1px 0 rgba(0,0,0,0.12)',
      },
    },
  },
  plugins: [],
};
export default config;
