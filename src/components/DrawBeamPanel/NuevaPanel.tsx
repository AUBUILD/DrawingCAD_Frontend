import React, { useEffect, useMemo, useRef, useState } from 'react';
import { C, NIVEL_COLOR, NIVEL_TYPES, ORDINALS, PAD, PREFIX } from '../shared/tokens';
import { Icon } from '../shared/Icon';
import { Cap, SectionTitle } from '../shared/primitives';
import { pickDefaultABCRForH, formatStirrupsABCR } from '../../utils/stirrupsUtils';
import { scanDxfSections } from '../../api';
import type { NivelType, Ordinal } from '../shared/tokens';
import type { useBeams } from './useBeams';
import type { DevelopmentIn } from '../../types';

type CreationMode = 'pick' | 'manual' | 'dxf' | 'batch' | 'dxf-config' | 'batch-config' | 'batch-preview';

interface NuevaPanelProps {
  ctx: ReturnType<typeof useBeams>;
  busy: boolean;
  onImportDxfFile: (file: File, config?: { h?: number; b?: number }) => void;
  onImportDxfBatchFile: (file: File, config?: { h?: number; b?: number }) => Promise<DevelopmentIn[]>;
  batchImportOrder: 'name' | 'location';
  setBatchImportOrder: React.Dispatch<React.SetStateAction<'name' | 'location'>>;
}

const S = {
  col: { display: 'flex', flexDirection: 'column' as const, gap: 8 },
  card: (color: string) => ({
    display: 'flex', alignItems: 'center' as const, gap: 10,
    padding: '10px 12px', borderRadius: 8,
    border: `1px solid ${C.border}`, background: C.card,
    textAlign: 'left' as const, cursor: 'pointer', boxShadow: 'none' as const,
  }),
  badge: (color: string) => ({
    width: 34, height: 34, borderRadius: 8,
    border: `1px solid ${color}55`, background: `${color}16`,
    display: 'flex', alignItems: 'center' as const, justifyContent: 'center' as const,
  }),
  monoSm: (color: string) => ({
    fontFamily: 'JetBrains Mono, monospace', fontWeight: 900 as const, fontSize: 11, color,
  }),
  codeBox: (color: string) => ({
    display: 'flex', alignItems: 'center' as const, gap: 8,
    padding: '9px 10px', borderRadius: 8,
    border: `1px solid ${color}55`, background: `${color}14`,
  }),
  codeLarge: (color: string) => ({
    fontFamily: 'JetBrains Mono, monospace', fontSize: 18, fontWeight: 900 as const,
    color, lineHeight: 1,
  }),
  backBtn: {
    border: `1px solid ${C.border}`, background: 'transparent', borderRadius: 4,
    color: C.sub, fontSize: 9, fontWeight: 700 as const, padding: '3px 7px', boxShadow: 'none' as const,
  },
  grid2: {
    display: 'grid', gridTemplateColumns: '1fr 14px 1fr', gap: 4, alignItems: 'end' as const,
  },
  createBtn: (color: string) => ({
    display: 'flex', alignItems: 'center' as const, justifyContent: 'center' as const,
    gap: 6, border: 'none', borderRadius: 7, padding: '8px',
    fontSize: 10, fontWeight: 900 as const, letterSpacing: '0.07em',
    color: C.bg, background: color, boxShadow: 'none' as const,
  }),
  modeBtn: {
    display: 'flex', alignItems: 'center' as const, gap: 8,
    padding: '10px 12px', borderRadius: 8,
    border: `1px solid ${C.border}`, background: C.card,
    textAlign: 'left' as const, cursor: 'pointer', boxShadow: 'none' as const,
    width: '100%' as const,
  },
  select: {
    padding: '4px 6px', background: C.card,
    border: `1px solid ${C.border}`, borderRadius: 4,
    color: C.text, fontSize: 11,
  },
} as const;

/** Shared ordinal pickers for Story i / Story f (allows same level = single floor) */
const OrdinalPickers: React.FC<{
  ini: string; fin: string;
  onIniChange: (v: string) => void; onFinChange: (v: string) => void;
}> = ({ ini, fin, onIniChange, onFinChange }) => {
  const iniIdx = ORDINALS.indexOf(ini as Ordinal);
  const finOpts = ORDINALS.filter((_, i) => i >= iniIdx);
  const finSafe = finOpts.includes(fin as Ordinal) ? fin : finOpts[0];

  return (
    <div style={S.grid2}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Cap ch="Story i" />
        <select value={ini} onChange={(e) => onIniChange(e.target.value)} className="input" style={{ height: 30 }}>
          {ORDINALS.map((o) => <option key={o}>{o}</option>)}
        </select>
      </div>
      <div style={{ color: C.dim, textAlign: 'center', paddingBottom: 6 }}>→</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Cap ch="Story f" />
        <select value={finSafe} onChange={(e) => onFinChange(e.target.value)} className="input" style={{ height: 30 }}>
          {finOpts.map((o) => <option key={o}>{o}</option>)}
        </select>
      </div>
    </div>
  );
};

/** Preview de estribos asignados segun H seleccionado */
const StirrupsPreview: React.FC<{ h: number }> = ({ h }) => {
  const sismico = useMemo(() => pickDefaultABCRForH(h, 'sismico'), [h]);
  const gravedad = useMemo(() => pickDefaultABCRForH(h, 'gravedad'), [h]);
  const rowStyle: React.CSSProperties = {
    display: 'grid', gridTemplateColumns: '70px 1fr', gap: 4,
    fontSize: 10, lineHeight: 1.5,
  };
  return (
    <div style={{ background: `${C.teal}08`, border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 8px' }}>
      <Cap ch={`Estribado asignado (h=${h.toFixed(2)}m)`} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
        <div style={rowStyle}>
          <span style={{ color: C.orange, fontWeight: 700 }}>Sismico:</span>
          <span style={{ color: C.text, fontFamily: 'JetBrains Mono, monospace' }}>{formatStirrupsABCR(sismico)}</span>
        </div>
        <div style={rowStyle}>
          <span style={{ color: C.blue, fontWeight: 700 }}>Gravedad:</span>
          <span style={{ color: C.text, fontFamily: 'JetBrains Mono, monospace' }}>{formatStirrupsABCR(gravedad)}</span>
        </div>
      </div>
    </div>
  );
};

export const NuevaPanel: React.FC<NuevaPanelProps> = ({
  ctx, busy, onImportDxfFile, onImportDxfBatchFile, batchImportOrder, setBatchImportOrder,
}) => {
  const [mode, setMode] = useState<CreationMode>('pick');
  const [tipo, setTipo] = useState<NivelType | null>(null);
  const [ini, setIni] = useState(ORDINALS[0] as string);
  const [fin, setFin] = useState(ORDINALS[0] as string);

  // Manual beam number override (null = auto)
  const [customNum, setCustomNum] = useState<number | null>(null);

  // DXF config state
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [dxfH, setDxfH] = useState(0.50);
  const [dxfB, setDxfB] = useState(0.25);
  const [batchPreview, setBatchPreview] = useState<DevelopmentIn[]>([]);

  const dxfInputRef = useRef<HTMLInputElement | null>(null);
  const batchDxfInputRef = useRef<HTMLInputElement | null>(null);

  const nextNum = useMemo(() => {
    if (!tipo) return 1;
    return ctx.nextFreeNumber(tipo);
  }, [ctx, tipo]);

  const effectiveNum = customNum ?? nextNum;
  const code = tipo ? `${PREFIX[tipo]}-${PAD(effectiveNum)}` : '—';
  const iniIdx = ORDINALS.indexOf(ini as Ordinal);
  const finOpts = ORDINALS.filter((_, i) => i >= iniIdx);
  const finSafe = finOpts.includes(fin as Ordinal) ? fin : finOpts[0];
  const color = tipo ? NIVEL_COLOR[tipo] : C.teal;

  const resetState = () => {
    setMode('pick');
    setTipo(null);
    setCustomNum(null);
    setIni(ORDINALS[0] as string);
    setFin(ORDINALS[0] as string);
    setPendingFile(null);
    setDxfH(0.50);
    setDxfB(0.25);
    setBatchPreview([]);
  };

  // Pre-scan: extraer seccion dominante del DXF para pre-llenar b/h defaults
  useEffect(() => {
    if (!pendingFile || (mode !== 'dxf-config' && mode !== 'batch-config')) return;
    let cancelled = false;
    scanDxfSections(pendingFile).then((res) => {
      if (cancelled) return;
      if (res.b != null && res.b > 0) setDxfB(res.b);
      if (res.h != null && res.h > 0) setDxfH(res.h);
    });
    return () => { cancelled = true; };
  }, [pendingFile, mode]);

  // ── Step 0: Pick creation mode ──
  if (mode === 'pick') {
    return (
      <div style={S.col}>
        <SectionTitle title="Crear vigas" />

        <button type="button" style={S.modeBtn} onClick={() => setMode('manual')}>
          <Icon name="plus" size={14} color={C.teal} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: C.text }}>Manual</div>
            <div style={{ fontSize: 9, color: C.sub }}>Crear viga vacia y definir geometria</div>
          </div>
          <Icon name="chevR" size={11} color={C.dim} />
        </button>

        <button type="button" style={S.modeBtn} onClick={() => setMode('dxf')}>
          <Icon name="dxf" size={14} color={C.blue} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: C.text }}>Importar DXF</div>
            <div style={{ fontSize: 9, color: C.sub }}>Una viga desde archivo DXF</div>
          </div>
          <Icon name="chevR" size={11} color={C.dim} />
        </button>

        <button type="button" style={S.modeBtn} onClick={() => setMode('batch')}>
          <Icon name="layers" size={14} color={C.orange} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: C.text }}>Batch DXF</div>
            <div style={{ fontSize: 9, color: C.sub }}>Multiples vigas desde un DXF</div>
          </div>
          <Icon name="chevR" size={11} color={C.dim} />
        </button>
      </div>
    );
  }

  // ── Step 1 for Manual: pick type ──
  if (mode === 'manual' && !tipo) {
    return (
      <div style={S.col}>
        <SectionTitle title="Selecciona tipo de viga" />
        {NIVEL_TYPES.map((type) => {
          const c = NIVEL_COLOR[type];
          return (
            <button key={type} type="button" onClick={() => setTipo(type)} style={S.card(c)}>
              <div style={S.badge(c)}>
                <span style={S.monoSm(c)}>{PREFIX[type]}</span>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: C.text }}>{type}</div>
                <div style={{ fontSize: 9, color: C.sub }}>Prefijo {PREFIX[type]}-XX</div>
              </div>
              <Icon name="chevR" size={11} color={C.dim} />
            </button>
          );
        })}
        <button type="button" onClick={resetState} style={{ ...S.backBtn, alignSelf: 'flex-start' }}>
          ← Modo
        </button>
      </div>
    );
  }

  // ── Step 2 for Manual: configure group + create ──
  if (mode === 'manual' && tipo) {
    const numExists = ctx.beams.some((b) => b.type === tipo && b.number === effectiveNum);
    return (
      <div style={S.col}>
        <SectionTitle title="Nueva viga" />
        <div style={S.codeBox(color)}>
          <div style={{ flex: 1 }}>
            <Cap ch="Codigo" />
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={S.codeLarge(color)}>{PREFIX[tipo]}-</span>
              <input
                type="number"
                min={1}
                max={99}
                value={effectiveNum}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (v >= 1 && v <= 99) setCustomNum(v);
                  else if (e.target.value === '') setCustomNum(null);
                }}
                style={{
                  width: 52, fontFamily: 'JetBrains Mono, monospace', fontSize: 18,
                  fontWeight: 900, color: color, background: 'transparent',
                  border: `1px solid ${color}55`, borderRadius: 4,
                  padding: '2px 6px', textAlign: 'center',
                }}
              />
            </div>
            {numExists && (
              <div style={{ fontSize: 9, color: C.red, marginTop: 2 }}>
                Ya existe {code}
              </div>
            )}
          </div>
          <button type="button" onClick={() => { setTipo(null); setCustomNum(null); }} style={S.backBtn}>← Tipo</button>
        </div>

        <OrdinalPickers ini={ini} fin={fin} onIniChange={setIni} onFinChange={setFin} />

        <button
          type="button"
          disabled={numExists}
          onClick={() => {
            ctx.addBeam(tipo, { ini: ini as Ordinal, fin: finSafe as Ordinal }, effectiveNum);
            resetState();
          }}
          style={{ ...S.createBtn(color), opacity: numExists ? 0.5 : 1 }}
        >
          <Icon name="plus" size={11} color={C.bg} />
          CREAR {code}
        </button>
      </div>
    );
  }

  // ── Import DXF (single) ──
  if (mode === 'dxf') {
    return (
      <div style={S.col}>
        <SectionTitle title="Importar DXF" />

        <div style={{ fontSize: 11, color: C.sub, lineHeight: 1.5 }}>
          Selecciona el archivo DXF con la geometria de una viga.
          Luego asigna el tipo y agrupacion de pisos.
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={() => dxfInputRef.current?.click()}
          style={S.createBtn(C.blue)}
        >
          <Icon name="dxf" size={13} color={C.bg} />
          {busy ? 'Importando...' : 'Seleccionar archivo DXF'}
        </button>

        <input
          ref={dxfInputRef}
          type="file"
          accept=".dxf"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) {
              setPendingFile(f);
              setMode('dxf-config');
            }
          }}
        />

        <button type="button" onClick={resetState} style={{ ...S.backBtn, alignSelf: 'flex-start' }}>
          ← Modo
        </button>
      </div>
    );
  }

  // ── Batch DXF ──
  if (mode === 'batch') {
    return (
      <div style={S.col}>
        <SectionTitle title="Batch DXF" />

        <div style={{ fontSize: 11, color: C.sub, lineHeight: 1.5 }}>
          Importa multiples vigas desde un solo archivo DXF.
          Cada desarrollo encontrado se cargara como viga independiente.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Cap ch="Orden de importacion" />
          <select
            className="input"
            style={{ height: 30, fontSize: 10 }}
            value={batchImportOrder}
            disabled={busy}
            onChange={(e) => setBatchImportOrder(e.target.value as 'name' | 'location')}
          >
            <option value="name">Por nombre (orden natural numerico)</option>
            <option value="location">Por ubicacion (arriba-abajo, izq-der)</option>
          </select>
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={() => batchDxfInputRef.current?.click()}
          style={S.createBtn(C.orange)}
        >
          <Icon name="layers" size={13} color={C.bg} />
          {busy ? 'Importando...' : 'Seleccionar archivo DXF'}
        </button>

        <input
          ref={batchDxfInputRef}
          type="file"
          accept=".dxf"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) {
              setPendingFile(f);
              setMode('batch-config');
            }
          }}
        />

        <button type="button" onClick={resetState} style={{ ...S.backBtn, alignSelf: 'flex-start' }}>
          ← Modo
        </button>
      </div>
    );
  }

  // ── DXF Config (single) — ask tipo, story, b×h then import + create beam ──
  if (mode === 'dxf-config' && pendingFile) {
    const cfgColor = tipo ? NIVEL_COLOR[tipo] : C.teal;
    const cfgEffNum = customNum ?? (tipo ? ctx.nextFreeNumber(tipo) : 1);
    const cfgCode = tipo ? `${PREFIX[tipo]}-${PAD(cfgEffNum)}` : '—';
    const cfgNumExists = tipo ? ctx.beams.some((b) => b.type === tipo && b.number === cfgEffNum) : false;
    const cfgIniIdx = ORDINALS.indexOf(ini as Ordinal);
    const cfgFinOpts = ORDINALS.filter((_, i) => i >= cfgIniIdx);
    const cfgFinSafe = cfgFinOpts.includes(fin as Ordinal) ? fin : cfgFinOpts[0];

    return (
      <div style={S.col}>
        <SectionTitle title="Configurar importacion DXF" />

        <div style={{ fontSize: 11, color: C.sub, lineHeight: 1.5 }}>
          Archivo: <strong style={{ color: C.text }}>{pendingFile.name}</strong>
        </div>

        {/* Tipo de viga */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Cap ch="Tipo de viga" />
          <div style={{ display: 'flex', gap: 4 }}>
            {NIVEL_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTipo(t)}
                style={{
                  ...S.backBtn,
                  background: tipo === t ? `${NIVEL_COLOR[t]}22` : 'transparent',
                  border: `1px solid ${tipo === t ? NIVEL_COLOR[t] : C.border}`,
                  color: tipo === t ? NIVEL_COLOR[t] : C.sub,
                  fontWeight: tipo === t ? 800 : 500,
                  padding: '5px 10px',
                  fontSize: 11,
                }}
              >
                {PREFIX[t]} — {t}
              </button>
            ))}
          </div>
        </div>

        {tipo && (
          <div style={S.codeBox(cfgColor)}>
            <div style={{ flex: 1 }}>
              <Cap ch="Codigo" />
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={S.codeLarge(cfgColor)}>{PREFIX[tipo]}-</span>
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={cfgEffNum}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (v >= 1 && v <= 99) setCustomNum(v);
                    else if (e.target.value === '') setCustomNum(null);
                  }}
                  style={{
                    width: 52, fontFamily: 'JetBrains Mono, monospace', fontSize: 18,
                    fontWeight: 900, color: cfgColor, background: 'transparent',
                    border: `1px solid ${cfgColor}55`, borderRadius: 4,
                    padding: '2px 6px', textAlign: 'center',
                  }}
                />
              </div>
              {cfgNumExists && (
                <div style={{ fontSize: 9, color: C.red, marginTop: 2 }}>
                  Ya existe {cfgCode}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Story range */}
        <OrdinalPickers ini={ini} fin={fin} onIniChange={setIni} onFinChange={setFin} />

        {/* Section b × h */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <Cap ch="b por defecto (m)" />
            <input
              className="input"
              type="number"
              step={0.05}
              min={0.1}
              value={dxfB}
              onChange={(e) => setDxfB(parseFloat(e.target.value) || 0.25)}
              style={{ height: 30 }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <Cap ch="h por defecto (m)" />
            <input
              className="input"
              type="number"
              step={0.05}
              min={0.1}
              value={dxfH}
              onChange={(e) => setDxfH(parseFloat(e.target.value) || 0.50)}
              style={{ height: 30 }}
            />
          </div>
        </div>

        <StirrupsPreview h={dxfH} />

        <button
          type="button"
          disabled={!tipo || busy || cfgNumExists}
          onClick={async () => {
            if (!tipo || !pendingFile || cfgNumExists) return;
            try {
              await onImportDxfFile(pendingFile, { h: dxfH, b: dxfB });
              const finVal = cfgFinSafe as Ordinal;
              ctx.addBeam(tipo, { ini: ini as Ordinal, fin: finVal }, cfgEffNum);
              resetState();
            } catch {
              // Error ya manejado en onImportDxfFile (setError)
            }
          }}
          style={{ ...S.createBtn(cfgColor), opacity: (tipo && !cfgNumExists) ? 1 : 0.5 }}
        >
          <Icon name="dxf" size={13} color={C.bg} />
          {busy ? 'Importando...' : `IMPORTAR ${tipo ? cfgCode : 'DXF'}`}
        </button>

        <button type="button" onClick={resetState} style={{ ...S.backBtn, alignSelf: 'flex-start' }}>
          ← Modo
        </button>
      </div>
    );
  }

  // ── Batch DXF Config — ask story, b×h, order; tipo comes from DXF names ──
  if (mode === 'batch-config' && pendingFile) {
    const cfgIniIdx = ORDINALS.indexOf(ini as Ordinal);
    const cfgFinOpts = ORDINALS.filter((_, i) => i >= cfgIniIdx);
    const cfgFinSafe = cfgFinOpts.includes(fin as Ordinal) ? fin : cfgFinOpts[0];

    return (
      <div style={S.col}>
        <SectionTitle title="Configurar Batch DXF" />

        <div style={{ fontSize: 11, color: C.sub, lineHeight: 1.5 }}>
          Archivo: <strong style={{ color: C.text }}>{pendingFile.name}</strong>
        </div>

        <div style={{ fontSize: 10, color: C.dim, lineHeight: 1.4 }}>
          El tipo y numero de cada viga se extraen automaticamente del DXF (VT-01, VS-02, etc).
        </div>

        {/* Story range (common for all imported beams) */}
        <OrdinalPickers ini={ini} fin={fin} onIniChange={setIni} onFinChange={setFin} />

        {/* Section b × h */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <Cap ch="b por defecto (m)" />
            <input
              className="input"
              type="number"
              step={0.05}
              min={0.1}
              value={dxfB}
              onChange={(e) => setDxfB(parseFloat(e.target.value) || 0.25)}
              style={{ height: 30 }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <Cap ch="h por defecto (m)" />
            <input
              className="input"
              type="number"
              step={0.05}
              min={0.1}
              value={dxfH}
              onChange={(e) => setDxfH(parseFloat(e.target.value) || 0.50)}
              style={{ height: 30 }}
            />
          </div>
        </div>

        <StirrupsPreview h={dxfH} />

        {/* Batch order */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Cap ch="Orden de importacion" />
          <select
            className="input"
            style={{ height: 30, fontSize: 10 }}
            value={batchImportOrder}
            disabled={busy}
            onChange={(e) => setBatchImportOrder(e.target.value as 'name' | 'location')}
          >
            <option value="name">Por nombre (orden natural numerico)</option>
            <option value="location">Por ubicacion (arriba-abajo, izq-der)</option>
          </select>
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            if (!pendingFile) return;
            const devs = await onImportDxfBatchFile(pendingFile, { h: dxfH, b: dxfB });
            if (devs.length > 0) {
              setBatchPreview(devs);
              setMode('batch-preview');
            }
          }}
          style={S.createBtn(C.orange)}
        >
          <Icon name="layers" size={13} color={C.bg} />
          {busy ? 'Importando...' : 'IMPORTAR BATCH'}
        </button>

        <button type="button" onClick={resetState} style={{ ...S.backBtn, alignSelf: 'flex-start' }}>
          ← Modo
        </button>
      </div>
    );
  }

  // ── Batch Preview — show recognized beams before confirming ──
  if (mode === 'batch-preview' && batchPreview.length > 0) {
    const cfgIniIdx = ORDINALS.indexOf(ini as Ordinal);
    const cfgFinOpts = ORDINALS.filter((_, i) => i >= cfgIniIdx);
    const cfgFinSafe = cfgFinOpts.includes(fin as Ordinal) ? fin : cfgFinOpts[0];

    return (
      <div style={S.col}>
        <SectionTitle title="Vigas reconocidas" />
        <div style={{ fontSize: 10, color: C.dim, lineHeight: 1.4 }}>
          {batchPreview.length} viga(s) detectadas. Revisa y confirma.
        </div>

        <div style={{
          maxHeight: 320, overflowY: 'auto',
          display: 'flex', flexDirection: 'column', gap: 4,
        }}>
          {batchPreview.map((d, i) => {
            const spans = d.spans ?? [];
            const sections = spans.map(s => `${s.b ?? '?'}x${s.h}`);
            // Most common section
            const sectionCounts: Record<string, number> = {};
            for (const sec of sections) {
              sectionCounts[sec] = (sectionCounts[sec] ?? 0) + 1;
            }
            const dominant = Object.entries(sectionCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '?';

            return (
              <div
                key={i}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 10px', borderRadius: 6,
                  border: `1px solid ${C.border}`,
                  background: C.card,
                }}
              >
                <div style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontWeight: 800, fontSize: 12, color: C.orange,
                  minWidth: 80,
                }}>
                  {d.name}
                </div>
                <div style={{ fontSize: 11, color: C.sub }}>
                  {spans.length} tramo{spans.length !== 1 ? 's' : ''}
                </div>
                <div style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 11, fontWeight: 600,
                  color: C.text,
                  marginLeft: 'auto',
                }}>
                  ({dominant})
                </div>
              </div>
            );
          })}
        </div>

        {/* Per-span detail for each beam */}
        <details style={{ marginTop: 4 }}>
          <summary style={{ fontSize: 10, color: C.dim, cursor: 'pointer' }}>
            Ver secciones por tramo
          </summary>
          <div style={{ maxHeight: 200, overflowY: 'auto', marginTop: 4, fontSize: 10, color: C.sub, lineHeight: 1.6 }}>
            {batchPreview.map((d, i) => (
              <div key={i}>
                <strong style={{ color: C.orange }}>{d.name}:</strong>{' '}
                {(d.spans ?? []).map((s, si) => (
                  <span key={si}>
                    T{si + 1}={s.b ?? '?'}x{s.h}
                    {si < (d.spans ?? []).length - 1 ? ', ' : ''}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </details>

        <button
          type="button"
          onClick={() => {
            const finVal = cfgFinSafe as Ordinal;
            ctx.addBeamsBatch(batchPreview, { ini: ini as Ordinal, fin: finVal });
            resetState();
          }}
          style={S.createBtn(C.teal)}
        >
          <Icon name="check" size={13} color={C.bg} />
          CONFIRMAR ({batchPreview.length} vigas)
        </button>

        <button type="button" onClick={() => setMode('batch-config')} style={{ ...S.backBtn, alignSelf: 'flex-start' }}>
          ← Volver a configurar
        </button>
      </div>
    );
  }

  return null;
};
