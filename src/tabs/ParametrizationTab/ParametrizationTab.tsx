import React, { useState } from 'react';
import { ConcreteTab, type ConcreteTabProps } from '../ConcreteTab';
import { SteelTab, type SteelTabProps } from '../SteelTab';
import { C } from '../../components/shared/tokens';
import { Icon, type IconName } from '../../components/shared/Icon';

type ParamTab = 'concreto' | 'acero';

export interface ParametrizationTabProps {
  concreteTabProps: ConcreteTabProps;
  steelTabProps: SteelTabProps;
  /** Callback so parent knows which inner tab is active (for steel overlay, etc.) */
  onInnerTabChange?: (tab: ParamTab) => void;
}

const SUB_TABS: Array<{ key: ParamTab; label: string; icon: IconName }> = [
  { key: 'concreto', label: 'Concreto', icon: 'beam' },
  { key: 'acero',    label: 'Acero',    icon: 'vigas' },
];

const S = {
  subNav: {
    display: 'flex',
    gap: 4,
    marginBottom: 8,
    paddingBottom: 6,
    borderBottom: `1px solid ${C.border}`,
  },
  subBtn: (active: boolean) => ({
    display: 'inline-flex',
    alignItems: 'center' as const,
    gap: 4,
    padding: '4px 10px',
    border: `1px solid ${active ? C.tealBd : C.border}`,
    borderRadius: 6,
    background: active ? 'rgba(24,208,184,0.12)' : 'transparent',
    color: active ? C.teal : C.sub,
    cursor: 'pointer' as const,
    fontSize: 10,
    fontWeight: active ? 700 : 500,
  }),
} as const;

export const ParametrizationTab: React.FC<ParametrizationTabProps> = ({
  concreteTabProps,
  steelTabProps,
  onInnerTabChange,
}) => {
  const [inner, setInner] = useState<ParamTab>('concreto');

  const changeInner = (t: ParamTab) => {
    setInner(t);
    onInnerTabChange?.(t);
  };

  return (
    <>
      <div style={S.subNav}>
        {SUB_TABS.map(({ key, label, icon }) => (
          <button key={key} type="button" style={S.subBtn(inner === key)} onClick={() => changeInner(key)}>
            <Icon name={icon} size={10} color={inner === key ? C.teal : C.dim} />
            {label}
          </button>
        ))}
      </div>
      {inner === 'concreto' && <ConcreteTab {...concreteTabProps} />}
      {inner === 'acero'    && <SteelTab    {...steelTabProps} />}
    </>
  );
};
