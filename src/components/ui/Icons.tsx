import * as React from 'react';

type P = React.SVGProps<SVGSVGElement> & { size?: number };
const base = (size = 24): React.SVGProps<SVGSVGElement> => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round',
});

export const WifiIcon = ({ size = 26, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M2.5 8.5a15.5 15.5 0 0 1 19 0" />
    <path d="M5.5 12.2a11 11 0 0 1 13 0" />
    <path d="M8.6 15.8a6.4 6.4 0 0 1 6.8 0" />
    <circle cx="12" cy="19.4" r="1.15" fill="currentColor" stroke="none" />
  </svg>
);

export const BellIcon = ({ size = 26, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M18 8.6a6 6 0 1 0-12 0c0 5.2-2 6.7-2 6.7h16s-2-1.5-2-6.7Z" />
    <path d="M13.7 19a2 2 0 0 1-3.4 0" />
  </svg>
);

export const MenuIcon = ({ size = 30, ...p }: P) => (
  <svg {...base(size)} strokeWidth={2.4} {...p}>
    <path d="M3.5 6.5h17M3.5 12h17M3.5 17.5h17" />
  </svg>
);

export const NotesIcon = ({ size = 26, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M4 4h9.5" />
    <path d="M4 4v16h16v-9" />
    <path d="M20.6 3.4a1.9 1.9 0 0 1 0 2.7l-7.4 7.4-3.4.7.7-3.4 7.4-7.4a1.9 1.9 0 0 1 2.7 0Z" />
  </svg>
);

export const CloseIcon = ({ size = 30, ...p }: P) => (
  <svg {...base(size)} strokeWidth={3.2} {...p}>
    <path d="M5 5l14 14M19 5 5 19" />
  </svg>
);

export const ChevronRight = ({ size = 24, ...p }: P) => (
  <svg {...base(size)} strokeWidth={3} {...p}><path d="M9 4.5 16.5 12 9 19.5" /></svg>
);

export const ArrowRight = ({ size = 30, ...p }: P) => (
  <svg {...base(size)} strokeWidth={2.4} {...p}><path d="M4 12h15.5M13 5.5 19.5 12 13 18.5" /></svg>
);

export const ArrowLeft = ({ size = 30, ...p }: P) => (
  <svg {...base(size)} strokeWidth={2.4} {...p}><path d="M20 12H4.5M11 5.5 4.5 12 11 18.5" /></svg>
);

export const CheckIcon = ({ size = 30, ...p }: P) => (
  <svg {...base(size)} strokeWidth={2.6} {...p}><path d="M4.5 12.8 9.6 18 19.5 6.5" /></svg>
);

export const SendIcon = ({ size = 26, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M21.5 2.5 2.8 9.6a.5.5 0 0 0 0 .93l7.4 2.9M21.5 2.5l-7.1 18.7a.5.5 0 0 1-.94.02l-2.86-7.4M21.5 2.5 10.6 13.4" />
  </svg>
);

export const ContrastIcon = ({ size = 24, ...p }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...p}>
    <circle cx="12" cy="12" r="9.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <path d="M12 2.8a9.2 9.2 0 0 1 0 18.4Z" fill="currentColor" />
  </svg>
);

export const TextSizeIcon = ({ size = 24, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <circle cx="10.5" cy="10.5" r="6.6" />
    <path d="M15.4 15.4 21 21M10.5 7.9v5.2M7.9 10.5h5.2" />
  </svg>
);

export const QuoteIcon = ({ size = 22, ...p }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" {...p}>
    <path d="M9.4 5.6c-3 1.3-4.9 3.8-4.9 6.9v5.9h6.4v-6.2H7.6c0-1.9.9-3.2 2.7-4.1l-.9-2.5Zm9.2 0c-3 1.3-4.9 3.8-4.9 6.9v5.9h6.4v-6.2h-3.3c0-1.9.9-3.2 2.7-4.1l-.9-2.5Z" />
  </svg>
);

export const HighlighterIcon = ({ size = 22, ...p }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" {...p}>
    <path d="M12 3.2v10.4" />
    <path d="M8.4 10.4 12 13.9l3.6-3.5" />
    <path d="M5.4 19.6h13.2" strokeWidth="2.6" />
  </svg>
);

export const FlagIcon = ({ size = 20, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M5 21V4.4M5 4.4h12.6l-2.3 4 2.3 4H5" /></svg>
);

export const PlayIcon = ({ size = 22, ...p }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" {...p}><path d="M7 4.6 19 12 7 19.4Z" /></svg>
);

export const PauseIcon = ({ size = 22, ...p }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" {...p}><path d="M7 4.5h3.4v15H7zM13.6 4.5H17v15h-3.4z" /></svg>
);

export const UsersIcon = ({ size = 22, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M16 20v-1.6a3.4 3.4 0 0 0-3.4-3.4H6.4A3.4 3.4 0 0 0 3 18.4V20" />
    <circle cx="9.5" cy="7.4" r="3.4" />
    <path d="M21 20v-1.6a3.4 3.4 0 0 0-2.6-3.3M15.4 4.2a3.4 3.4 0 0 1 0 6.5" />
  </svg>
);

export const CalendarIcon = ({ size = 22, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <rect x="3" y="5" width="18" height="16" rx="2.4" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </svg>
);

export const ChartIcon = ({ size = 22, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M4 20V4" /><path d="M4 20h16" />
    <path d="M8 17v-5M12.5 17V7M17 17v-8" />
  </svg>
);

export const PenIcon = ({ size = 22, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M4 20.5 8.4 19.4l11-11a2.4 2.4 0 0 0-3.4-3.4l-11 11L4 20.5Z" />
    <path d="M14.8 6.2 17.8 9.2" />
  </svg>
);

export const KeyIcon = ({ size = 22, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <circle cx="7.8" cy="15.8" r="3.8" />
    <path d="M10.6 13 20 3.6M17.2 6.4l2.2 2.2M14.6 9l2.2 2.2" />
  </svg>
);

export const UploadIcon = ({ size = 22, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M4 15.5V19a1.8 1.8 0 0 0 1.8 1.8h12.4A1.8 1.8 0 0 0 20 19v-3.5" />
    <path d="M12 15.5V3.6M7.6 8 12 3.6 16.4 8" />
  </svg>
);

export const HomeIcon = ({ size = 22, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M3.5 10.6 12 3.6l8.5 7v9a1.4 1.4 0 0 1-1.4 1.4H4.9a1.4 1.4 0 0 1-1.4-1.4v-9Z" />
    <path d="M9.4 21v-7h5.2v7" />
  </svg>
);

export const BookIcon = ({ size = 22, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M4 4.6h6a3 3 0 0 1 3 3V21a2.4 2.4 0 0 0-2.4-2.4H4V4.6Z" />
    <path d="M20 4.6h-6a3 3 0 0 0-3 3V21a2.4 2.4 0 0 1 2.4-2.4H20V4.6Z" />
  </svg>
);
