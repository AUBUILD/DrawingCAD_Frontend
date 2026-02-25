import React from 'react';
import { ConfigTab, type ConfigTabProps } from '../tabs/ConfigTab';
import { ConcreteTab, type ConcreteTabProps } from '../tabs/ConcreteTab';
import { SteelTab, type SteelTabProps } from '../tabs/SteelTab';
import { MetradoTab, type MetradoTabProps } from '../tabs/MetradoTab';
import { JsonTab, type JsonTabProps } from '../tabs/JsonTab';
import type { DefaultPreferenceId } from '../utils';

type Tab = 'config' | 'concreto' | 'acero' | 'metrado' | 'json';

export interface LeftPanelProps {
  tab: Tab;
  setTab: (tab: Tab) => void;
  editorOpen: boolean;
  setEditorOpen: (open: boolean) => void;
  defaultPref: DefaultPreferenceId;
  onChangeDefaultPref: (pref: DefaultPreferenceId) => void;
  configTabProps: ConfigTabProps;
  concreteTabProps: ConcreteTabProps;
  steelTabProps: SteelTabProps;
  metradoTabProps: MetradoTabProps;
  jsonTabProps: JsonTabProps;
}

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'config', label: 'Config' },
  { key: 'concreto', label: 'Concreto' },
  { key: 'acero', label: 'Acero' },
  { key: 'metrado', label: 'Metrado' },
  { key: 'json', label: 'JSON' },
];

export const LeftPanel: React.FC<LeftPanelProps> = ({
  tab,
  setTab,
  editorOpen,
  setEditorOpen,
  defaultPref,
  onChangeDefaultPref,
  configTabProps,
  concreteTabProps,
  steelTabProps,
  metradoTabProps,
  jsonTabProps,
}) => {
  return (
    <div className="leftPane">
      <section className="panel" style={{ padding: 10 }}>
        <div className="segmented" aria-label="Navegacion">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              className={tab === key ? 'segBtn segBtnActive' : 'segBtn'}
              onClick={() => setTab(key)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <details
        className="panel"
        open={editorOpen}
        onToggle={(e) => setEditorOpen((e.currentTarget as HTMLDetailsElement).open)}
      >
        <summary className="panelSummary">
          <div className="panelSummaryInner">
            <div className="panelTitle" style={{ marginBottom: 0 }}>EDITOR DE DESARROLLO DE VIGA.</div>

            {tab === 'config' ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <label
                  className="field"
                  style={{ minWidth: 260, flex: 1 }}
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <div className="label">Preferencia</div>
                  <select
                    className="input"
                    value={defaultPref}
                    onChange={(e) => onChangeDefaultPref(e.target.value as DefaultPreferenceId)}
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <option value="basico">Preferencia 01: Basico</option>
                    <option value="basico_bastones">Preferencia 02: Basico + Bastones</option>
                    <option value="personalizado">Personalizado</option>
                  </select>
                </label>
              </div>
            ) : null}
          </div>
        </summary>

        {tab === 'config' ? <ConfigTab {...configTabProps} /> : null}
        {tab === 'concreto' ? <ConcreteTab {...concreteTabProps} /> : null}
        {tab === 'acero' ? <SteelTab {...steelTabProps} /> : null}
        {tab === 'metrado' ? <MetradoTab {...metradoTabProps} /> : null}
        {tab === 'json' ? <JsonTab {...jsonTabProps} /> : null}
      </details>
    </div>
  );
};
