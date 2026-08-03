import type { PageId } from '../../types';
import type { ReactNode } from 'react';

type AppIconProps = {
  name: PageId;
  className?: string;
};

const paths: Record<PageId, ReactNode> = {
  home: <><path d="M4 11.5 12 5l8 6.5" /><path d="M6.5 10.5V20h11v-9.5M10 20v-5h4v5" /></>,
  'edge-ai': <><path d="M5 4.5h10a3 3 0 0 1 3 3V20H8a3 3 0 0 1-3-3Z" /><path d="M8 4.5V17a3 3 0 0 0 3 3M10.5 9h4M10.5 13h4" /><path d="m18 4 1-2 1 2 2 1-2 1-1 2-1-2-2-1Z" /></>,
  chat: <><path d="M5 18.5 3.8 21l3.9-1.4c1.2.6 2.7.9 4.3.9 5 0 9-3.6 9-8s-4-8-9-8-9 3.6-9 8c0 2.4 1.1 4.5 3 6Z" /><path d="M8 12h.01M12 12h.01M16 12h.01" /></>,
  inbox: <><path d="M4 5.5h16v14H4z" /><path d="M4 14h4l1.5 2h5l1.5-2h4M12 4v8m0 0 3-3m-3 3L9 9" /></>,
  projects: <><rect x="3.5" y="4" width="7" height="7" rx="2" /><rect x="13.5" y="4" width="7" height="7" rx="2" /><rect x="3.5" y="14" width="7" height="6" rx="2" /><rect x="13.5" y="14" width="7" height="6" rx="2" /></>,
  review: <><path d="M4 18 9 13l3 3 7-8" /><path d="M14 8h5v5" /><path d="M4 5v3M4 12v7h16" /></>,
  todo: <><path d="m4 7 1.5 1.5L8.5 5M11 7h9M4 13l1.5 1.5 3-3M11 13h9M4 19l1.5 1.5 3-3M11 19h9" /></>,
  schedule: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M7 3v4M17 3v4M3 10h18M7 14h3M14 14h3M7 18h3" /></>,
  growth: <><path d="M4 20V10M10 20V5M16 20v-8M22 20H2" /><path d="m4 8 6-5 6 6 5-5" /></>,
  creative: <><path d="m4 20 4.5-1 10-10-3.5-3.5-10 10L4 20Z" /><path d="m13.5 7 3.5 3.5M15 4l1.5-1.5M20 9h2M19 4l1.5-1.5" /></>,
  treehole: <><rect x="4" y="10" width="16" height="11" rx="3" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></>,
  tools: <><path d="M12 3a9 9 0 1 0 9 9" /><path d="M12 7v5l3 2M18.5 3.5v4M16.5 5.5h4" /></>,
  settings: <><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /><path d="M4 12h3M11 12h9" /><circle cx="9" cy="12" r="2" /></>,
};

function AppIcon({ name, className = '' }: AppIconProps) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export default AppIcon;
