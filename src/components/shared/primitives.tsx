import React from 'react';
import { T } from '../../styles/tokens';

export const Cap: React.FC<{ ch: string; style?: React.CSSProperties }> = ({ ch, style }) => (
  <span
    style={{
      fontSize: 8,
      fontWeight: 800,
      letterSpacing: '0.13em',
      color: T.sub,
      textTransform: 'uppercase',
      ...style,
    }}
  >
    {ch}
  </span>
);

export const Pill: React.FC<{
  children: React.ReactNode;
  active?: boolean;
  color?: string;
  onClick?: () => void;
}> = ({ children, active = false, color = T.teal, onClick }) => (
  <button
    onClick={onClick}
    type="button"
    style={{
      padding: '3px 9px',
      borderRadius: 20,
      fontSize: 8.5,
      fontWeight: 800,
      letterSpacing: '0.06em',
      cursor: 'pointer',
      border: `1px solid ${active ? color : T.line}`,
      background: active ? `${color}18` : 'transparent',
      color: active ? color : T.sub,
      whiteSpace: 'nowrap',
    }}
  >
    {children}
  </button>
);

export const ToggleChip: React.FC<{
  label: string;
  val: boolean;
  set: React.Dispatch<React.SetStateAction<boolean>>;
  color?: string;
}> = ({ label, val, set, color = T.teal }) => (
  <button
    onClick={() => set((v) => !v)}
    type="button"
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      padding: '3px 8px',
      fontSize: 8.5,
      fontWeight: 800,
      letterSpacing: '0.05em',
      borderRadius: 5,
      cursor: 'pointer',
      border: `1px solid ${val ? color + '44' : T.line}`,
      background: val ? `${color}10` : 'transparent',
      color: val ? color : T.dim,
    }}
  >
    <div
      style={{
        width: 4,
        height: 4,
        borderRadius: '50%',
        background: val ? color : T.dim,
      }}
    />
    {label}
  </button>
);

export const SectionTitle: React.FC<{ title: string }> = ({ title }) => (
  <div
    style={{
      paddingBottom: 6,
      marginBottom: 8,
      borderBottom: `1px solid ${T.line}`,
      fontSize: 10,
      fontWeight: 800,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      color: T.sub,
    }}
  >
    {title}
  </div>
);
