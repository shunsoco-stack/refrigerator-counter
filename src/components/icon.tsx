import type { ReactNode, SVGProps } from "react";

const paths: Record<string, ReactNode> = {
  fridge: <><rect x="5" y="2.5" width="14" height="19" rx="2.5" /><path d="M5 9h14M8.5 5.5v1M8.5 12v3M8 21.5v1M16 21.5v1" /></>,
  snow: <><path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M9 3.5l3 3 3-3M9 20.5l3-3 3 3M3.3 10.5l4.1-1.1-1.1-4.1M17.7 18.7l-1.1-4.1 4.1-1.1M3.3 13.5l4.1 1.1-1.1 4.1M17.7 5.3l-1.1 4.1 4.1 1.1" /></>,
  drink: <><path d="m7 8 1.5 13h7L17 8H7ZM13 8l1-5h4M8 13h8" /></>,
  food: <><path d="M7 3v7M3 3v5a4 4 0 0 0 8 0V3M7 12v9M18 3c-3 3-3 7 0 9h2V3h-2ZM20 12v9" /></>,
  sparkles: <><path d="m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4L12 3ZM20 2v4M18 4h4" /></>,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
  empty: <><path d="m3 9 9-5 9 5v10l-9 3-9-3V9Zm0 0 9 4 9-4M12 13v9M8 2h8" /></>,
  undo: <><path d="M8 4 3 9l5 5M3 9h11a6 6 0 0 1 0 12h-3" /></>,
  chart: <><path d="M4 3v17h17M8 15V9M13 15V5M18 15v-4" /></>,
  trophy: <><path d="M8 3h8v5a4 4 0 0 1-8 0V3ZM8 5H4v2a4 4 0 0 0 4 4M16 5h4v2a4 4 0 0 1-4 4M12 12v6M8 21v-3h8v3M6 21h12" /></>,
  shield: <><path d="m12 2 8 3v6c0 5-8 11-8 11S4 16 4 11V5l8-3Z" /><path d="m8 11 3 3 5-5" /></>,
  crown: <><path d="m3 6 4 4 5-7 5 7 4-4-2 12H5L3 6ZM6 21h12" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5" /></>,
  moon: <path d="M20.5 13a8.5 8.5 0 0 1-9.5-9.5 8.5 8.5 0 1 0 9.5 9.5Z" />,
  monitor: <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M9 21h6M12 17v4" /></>,
  download: <><path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4" /></>,
  share: <><path d="M12 15V2m-4 4 4-4 4 4M7 10H4v11h16V10h-3" /></>,
  chevron: <path d="m8 5 7 7-7 7" />,
  arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
  check: <path d="m5 12 4 4L19 6" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 2v6M17 2v6M3 11h18" /></>,
  lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V6a4 4 0 0 1 8 0v4M12 14v3" /></>,
};

export type IconName = keyof typeof paths;
export function Icon({ name, size = 20, ...props }: SVGProps<SVGSVGElement> & { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}>{paths[name]}</svg>;
}
