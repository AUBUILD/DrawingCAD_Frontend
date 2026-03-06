import React from 'react';

export type IconName =
  | 'settings' | 'plus' | 'layers' | 'edit' | 'export'
  | 'chevronDown' | 'trash' | 'check' | 'close' | 'dxf'
  | 'table' | 'arrow' | 'dot' | 'warning' | 'beams'
  | 'vigas' | 'cfg' | 'chevD' | 'chevR' | 'cube3d' | 'ortho'
  | 'eye' | 'xlsx' | 'beam' | 'user' | 'logout' | 'proj' | 'save' | 'section' | 'general';

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  className?: string;
  style?: React.CSSProperties;
}

const paths: Record<IconName, React.ReactNode> = {
  settings: (<><circle cx="8" cy="8" r="2.5" /><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.1 3.1l1.4 1.4M11.5 11.5l1.4 1.4M3.1 12.9l1.4-1.4M11.5 4.5l1.4-1.4" /></>),
  plus: <path d="M8 2v12M2 8h12" />,
  layers: (<><path d="M1 5l7-2.5L15 5l-7 2.5L1 5z"/><path d="M1 9l7 2.5L15 9"/><path d="M1 13l7 2.5L15 13"/></>),
  edit: <path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5Z" />,
  export: (<><path d="M8 2v9M5 8l3 3 3-3"/><path d="M2 12v2h12v-2"/></>),
  chevronDown: <path d="M4 6l4 4 4-4" />,
  trash: (<><path d="M2 4h12"/><path d="M5 4V2h6v2"/><path d="M6 7v5M10 7v5M3 4l1 10h8l1-10"/></>),
  check: <path d="M3 8l4 4 6-6" />,
  close: (<><path d="M3 3l10 10" /><path d="M13 3L3 13" /></>),
  dxf: (<><rect x="2" y="1" width="9" height="13" rx="1"/><path d="M9 1l3 3v9"/><path d="M9 1v3h3"/><path d="M4 7h5M4 9.5h3"/></>),
  table: (<><rect x="1.5" y="1.5" width="13" height="13" rx="1"/><path d="M1.5 5.5h13M1.5 9.5h13M5.5 1.5v13M10.5 1.5v13"/></>),
  arrow: <path d="M3 8h10M9 4l4 4-4 4" />,
  dot: <circle cx="8" cy="8" r="3" />,
  warning: (<><path d="M8 1.5L1 14h14L8 1.5Z"/><path d="M8 6v4"/><circle cx="8" cy="12" r=".5"/></>),
  beams: (<><rect x="1" y="5" width="14" height="4" rx="1"/><path d="M4 5V3M8 5V2M12 5V3M4 9v2M8 9v3M12 9v2"/></>),
  vigas: (<><rect x="1" y="5" width="14" height="4" rx="1"/><path d="M4 5V3M8 5V2M12 5V3M4 9v2M8 9v3M12 9v2"/></>),
  cfg: (<><circle cx="8" cy="8" r="2.5"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.1 3.1l1.4 1.4M11.5 11.5l1.4 1.4M3.1 12.9l1.4-1.4M11.5 4.5l1.4-1.4"/></>),
  chevD: <path d="M4 6l4 4 4-4" />,
  chevR: <path d="M6 4l4 4-4 4" />,
  cube3d: (<><path d="M8 2l6 3v6L8 14 2 11V5l6-3z"/><path d="M8 2v12M2 5l6 3 6-3"/></>),
  ortho: (<><rect x="2" y="2" width="12" height="12" rx="1"/><path d="M2 6h12M2 10h12M6 2v12M10 2v12"/></>),
  eye: (<><path d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z"/><circle cx="8" cy="8" r="2"/></>),
  xlsx: (<><rect x="2" y="2" width="12" height="12" rx="1"/><path d="M5 5l6 6M11 5l-6 6"/></>),
  beam: (<><rect x="1" y="5.5" width="14" height="5" rx="1.5"/><path d="M4 5.5V4M8 5.5V3M12 5.5V4M4 10.5V12M8 10.5v1.5M12 10.5V12"/></>),
  user: (<><circle cx="8" cy="5" r="3"/><path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6"/></>),
  logout: (<><path d="M6 3H3a1 1 0 00-1 1v8a1 1 0 001 1h3"/><path d="M10 5l4 3-4 3M6 8h8"/></>),
  proj: (<><rect x="2" y="3" width="12" height="10" rx="1"/><path d="M5 3V1M11 3V1M2 7h12"/></>),
  save: (<><path d="M2 2h9l3 3v9a1 1 0 01-1 1H2a1 1 0 01-1-1V3a1 1 0 011-1z"/><path d="M5 2v4h6V2M4 12h8"/></>),
  section: (<><rect x="3" y="2" width="10" height="12" rx="1"/><circle cx="7" cy="6" r="1" fill="currentColor" stroke="none"/><circle cx="9" cy="6" r="1" fill="currentColor" stroke="none"/><circle cx="7" cy="9" r="1" fill="currentColor" stroke="none"/><circle cx="9" cy="9" r="1" fill="currentColor" stroke="none"/></>),
  general: <polyline points="2,12 5,7 8,9 11,4 14,6" />,
};

export const Icon: React.FC<IconProps> = ({ name, size = 16, color = 'currentColor', className, style }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    stroke={color}
    strokeWidth={1.6}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={style}
  >
    {paths[name]}
  </svg>
);
