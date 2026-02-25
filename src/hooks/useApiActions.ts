import { useCallback } from 'react';
import type { DevelopmentIn, PreviewRequest, SpanIn } from '../types';
import type { AppConfig } from '../services';
import {
  normalizeDev,
  defaultDevelopment,
  INITIAL_SPAN,
} from '../services';
import {
  applyBasicPreferenceToNodes,
  applyBasicPreferenceToSpans,
  applyBasicBastonesPreferenceToNodes,
  applyBasicBastonesPreferenceToSpans,
} from '../services/steelService';
import {
  exportDxf,
  importDxf,
  saveState,
  uploadTemplateDxf,
  clearTemplateDxf,
} from '../api';
import {
  clampNumber,
  safeParseJson,
  type DefaultPreferenceId,
} from '../utils';
import { downloadBlob } from '../services';
import type { Selection } from '../services';

interface UseApiActionsParams {
  dev: DevelopmentIn;
  setDev: React.Dispatch<React.SetStateAction<DevelopmentIn>>;
  appCfg: AppConfig;
  setAppCfg: React.Dispatch<React.SetStateAction<AppConfig>>;
  payload: any;
  savedCuts: Array<{ xU: number }>;
  cascoLayer: string;
  steelLayer: string;
  drawSteel: boolean;
  defaultPref: DefaultPreferenceId;
  setBusy: React.Dispatch<React.SetStateAction<boolean>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setWarning: React.Dispatch<React.SetStateAction<string | null>>;
  setTemplateName: React.Dispatch<React.SetStateAction<string | null>>;
  setTemplateLayers: React.Dispatch<React.SetStateAction<string[]>>;
  setCascoLayer: React.Dispatch<React.SetStateAction<string>>;
  setSteelLayer: React.Dispatch<React.SetStateAction<string>>;
  jsonText: string;
  setSaveStatus: React.Dispatch<React.SetStateAction<'saved' | 'saving' | 'error' | null>>;
  setSelection: React.Dispatch<React.SetStateAction<Selection>>;
  setDetailViewport: React.Dispatch<React.SetStateAction<any>>;
  setConcretoLocked: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useApiActions({
  dev,
  setDev,
  appCfg,
  setAppCfg,
  payload,
  savedCuts,
  cascoLayer,
  steelLayer,
  drawSteel,
  defaultPref,
  setBusy,
  setError,
  setWarning,
  setTemplateName,
  setTemplateLayers,
  setCascoLayer,
  setSteelLayer,
  jsonText,
  setSaveStatus,
  setSelection,
  setDetailViewport,
  setConcretoLocked,
}: UseApiActionsParams) {

  const handleSaveManual = useCallback(async () => {
    try {
      setBusy(true);
      setSaveStatus('saving');
      await saveState(payload);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus(null), 2000);
    } catch (err: any) {
      setSaveStatus('error');
      setError(err?.message ?? 'Error al guardar');
      setTimeout(() => setSaveStatus(null), 4000);
    } finally {
      setBusy(false);
    }
  }, [payload, setBusy, setSaveStatus, setError]);

  const clearDevelopment = useCallback(() => {
    const ok = window.confirm('¿Limpiar todos los datos y empezar un nuevo desarrollo?');
    if (!ok) return;
    setError(null);
    setWarning(null);
    setSelection({ kind: 'none' });
    setDetailViewport(null);
    setConcretoLocked(false);
    setDev(defaultDevelopment(appCfg));
  }, [appCfg, setDev, setError, setWarning, setSelection, setDetailViewport, setConcretoLocked]);

  const onExportDxf = useCallback(async () => {
    try {
      setBusy(true);
      const blob = await exportDxf({ ...payload, savedCuts }, { cascoLayer, steelLayer, drawSteel });
      downloadBlob(blob, `beamdrawing-${(dev.name ?? 'desarrollo').replace(/\s+/g, '_')}.dxf`);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }, [payload, savedCuts, cascoLayer, steelLayer, drawSteel, dev.name, setBusy, setError]);

  const onUploadTemplate = useCallback(async (file: File) => {
    try {
      setBusy(true);
      setError(null);
      const info = await uploadTemplateDxf(file);
      setTemplateName(info.filename);
      setTemplateLayers(info.layers ?? []);

      if (info.layers?.length && !info.layers.includes(cascoLayer)) {
        setCascoLayer(info.layers.includes('A-BEAM-CASCO') ? 'A-BEAM-CASCO' : info.layers[0]);
      }
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }, [cascoLayer, setBusy, setError, setTemplateName, setTemplateLayers, setCascoLayer]);

  const onClearTemplate = useCallback(async () => {
    try {
      setBusy(true);
      setError(null);
      await clearTemplateDxf();
      setTemplateName(null);
      setTemplateLayers([]);
      setCascoLayer('A-BEAM-CASCO');
      setSteelLayer('A-REBAR-CORRIDO');
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }, [setBusy, setError, setTemplateName, setTemplateLayers, setCascoLayer, setSteelLayer]);

  const onImportDxfFile = useCallback(async (file: File) => {
    try {
      setBusy(true);
      setError(null);
      setWarning(null);
      const res = await importDxf(file);
      // El DXF define geometría (L y nodos). Mantén h/b según el Tramo 1 actual.
      const span1 = (dev.spans ?? [])[0] ?? INITIAL_SPAN;
      const h0 = span1.h;
      const b0 = span1.b ?? INITIAL_SPAN.b ?? 0;
      let incoming: DevelopmentIn = {
        ...res.development,
        floor_start: (dev as any).floor_start ?? '6to',
        floor_end: (dev as any).floor_end ?? '9no',
        spans: (res.development.spans ?? []).map((s: SpanIn) => ({ ...s, h: h0, b: b0 })),
      };

      // Aplicar preferencia de acero en nodos y spans
      if (defaultPref === 'basico' || defaultPref === 'basico_bastones') {
        const applyN = defaultPref === 'basico_bastones' ? applyBasicBastonesPreferenceToNodes : applyBasicPreferenceToNodes;
        let updatedNodes = incoming.nodes;
        let updatedSpans = incoming.spans;

        if (incoming.nodes && incoming.nodes.length > 0) {
          updatedNodes = applyN([...incoming.nodes]);
        }
        if (incoming.spans && incoming.spans.length > 0) {
          updatedSpans = defaultPref === 'basico_bastones'
            ? applyBasicBastonesPreferenceToSpans([...incoming.spans], updatedNodes)
            : applyBasicPreferenceToSpans([...incoming.spans]);
        }

        incoming = { ...incoming, nodes: updatedNodes, spans: updatedSpans };
      }

      setDev(normalizeDev(incoming, appCfg));
      if (res.warnings?.length) setWarning(res.warnings.join('\n'));
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }, [dev, appCfg, defaultPref, setDev, setBusy, setError, setWarning]);

  const applyJsonToForm = useCallback(() => {
    const parsed = safeParseJson<PreviewRequest>(jsonText);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    if (!parsed.value.developments?.length) {
      setError('JSON no contiene developments');
      return;
    }

    const incoming = parsed.value.developments[0];
    const nextCfg: AppConfig = {
      d: clampNumber(incoming.d ?? appCfg.d, appCfg.d),
      unit_scale: clampNumber(incoming.unit_scale ?? appCfg.unit_scale, appCfg.unit_scale),
      x0: clampNumber(incoming.x0 ?? appCfg.x0, appCfg.x0),
      y0: clampNumber(incoming.y0 ?? appCfg.y0, appCfg.y0),
      recubrimiento: clampNumber(
        (incoming as any).recubrimiento ?? (incoming as any).steel_cover_top ?? (incoming as any).steel_cover_bottom ?? appCfg.recubrimiento,
        appCfg.recubrimiento
      ),
      baston_Lc: clampNumber((incoming as any).baston_Lc ?? (incoming as any).bastonLc ?? appCfg.baston_Lc, appCfg.baston_Lc),
    };
    setAppCfg(nextCfg);
    setDev(normalizeDev(incoming, nextCfg));
    setError(null);
  }, [jsonText, appCfg, setAppCfg, setDev, setError]);

  return {
    handleSaveManual,
    clearDevelopment,
    onExportDxf,
    onUploadTemplate,
    onClearTemplate,
    onImportDxfFile,
    applyJsonToForm,
  };
}
