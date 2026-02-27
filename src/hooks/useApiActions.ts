import { useCallback } from 'react';
import type { DevelopmentIn, ExportMode, PreviewRequest, SpanIn } from '../types';
import type { AppConfig } from '../services';
import {
  normalizeDev,
  defaultDevelopment,
  INITIAL_SPAN,
  buildQuantityExportOverlayPayload,
  toPreviewPayloadSingle,
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
  importDxfBatch,
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
  developments: DevelopmentIn[];
  exportMode: ExportMode;
  setExportMode: React.Dispatch<React.SetStateAction<ExportMode>>;
  setDev: React.Dispatch<React.SetStateAction<DevelopmentIn>>;
  setDevelopments: React.Dispatch<React.SetStateAction<DevelopmentIn[]>>;
  setActiveDevIdx: React.Dispatch<React.SetStateAction<number>>;
  appCfg: AppConfig;
  setAppCfg: React.Dispatch<React.SetStateAction<AppConfig>>;
  payload: any;
  savedCuts: Array<{ xU: number }>;
  cascoLayer: string;
  steelLayer: string;
  drawSteel: boolean;
  quantityDisplay: any;
  sectionXU: number;
  recubrimientoM: number;
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
  batchImportOrder: 'name' | 'location';
}

export function useApiActions({
  dev,
  developments,
  exportMode,
  setExportMode,
  setDev,
  setDevelopments,
  setActiveDevIdx,
  appCfg,
  setAppCfg,
  payload,
  savedCuts,
  cascoLayer,
  steelLayer,
  drawSteel,
  quantityDisplay,
  sectionXU,
  recubrimientoM,
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
  batchImportOrder,
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
    const fresh = normalizeDev(defaultDevelopment(appCfg), appCfg);
    setError(null);
    setWarning(null);
    setSelection({ kind: 'none' });
    setDetailViewport(null);
    setConcretoLocked(false);
    setDev(fresh);
    setDevelopments([fresh]);
    setActiveDevIdx(0);
    setExportMode('single');
  }, [appCfg, setDev, setDevelopments, setActiveDevIdx, setExportMode, setError, setWarning, setSelection, setDetailViewport, setConcretoLocked]);

  const onExportDxf = useCallback(async () => {
    try {
      setBusy(true);

      if (exportMode !== 'single' && developments.length > 1) {
        // Filter by beam type if needed
        let devsToExport = developments;
        if (exportMode === 'all_conv') {
          devsToExport = developments.filter((d) => (d.beam_type ?? 'convencional') === 'convencional');
        } else if (exportMode === 'all_prefab') {
          devsToExport = developments.filter((d) => d.beam_type === 'prefabricada');
        }
        if (!devsToExport.length) {
          setError('No hay vigas del tipo seleccionado para exportar.');
          return;
        }
        // Sort by beam number (ascending) so smallest is at bottom in DXF
        const sorted = [...devsToExport].sort((a, b) => {
          const numA = parseInt((a.name ?? '').match(/\d+/)?.[0] ?? '999', 10);
          const numB = parseInt((b.name ?? '').match(/\d+/)?.[0] ?? '999', 10);
          return numA - numB;
        });
        // Export all developments spaced vertically (first = bottom)
        const VERTICAL_SPACING = 3.0; // meters between each beam
        const spacedDevs = sorted.map((d, i) => {
          const yOffset = i * VERTICAL_SPACING;
          const single = toPreviewPayloadSingle(d);
          return { ...single, y0: (single.y0 ?? 0) + yOffset };
        });
        const multiPayload = { developments: spacedDevs, savedCuts } as any;
        const blob = await exportDxf(multiPayload, { cascoLayer, steelLayer, drawSteel });
        const suffix = exportMode === 'all_conv' ? 'Conv' : exportMode === 'all_prefab' ? 'Prefab' : 'All';
        downloadBlob(blob, `beamdrawing-${suffix}.dxf`);
      } else {
        // Export only the active development
        const singlePayload = { developments: [dev] } as any;
        const dxfQuantityOverlay = buildQuantityExportOverlayPayload(dev, recubrimientoM, sectionXU, quantityDisplay);
        const blob = await exportDxf(
          { ...singlePayload, savedCuts, dxf_quantity_overlay: dxfQuantityOverlay } as any,
          { cascoLayer, steelLayer, drawSteel }
        );
        downloadBlob(blob, `beamdrawing-${(dev.name ?? 'desarrollo').replace(/\s+/g, '_')}.dxf`);
      }
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }, [payload, savedCuts, cascoLayer, steelLayer, drawSteel, dev.name, dev, developments, exportMode, recubrimientoM, sectionXU, quantityDisplay, setBusy, setError]);

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

  const onImportDxfBatchFile = useCallback(async (file: File) => {
    try {
      setBusy(true);
      setError(null);
      setWarning(null);
      const res = await importDxfBatch(file, batchImportOrder);
      if (!res.developments?.length) {
        setError('El DXF no contiene desarrollos validos.');
        return;
      }

      // Mantener h/b del Tramo 1 actual
      const span1 = (dev.spans ?? [])[0] ?? INITIAL_SPAN;
      const h0 = span1.h;
      const b0 = span1.b ?? INITIAL_SPAN.b ?? 0;

      const normalizedDevs = res.developments.map((d: DevelopmentIn) => {
        let incoming: DevelopmentIn = {
          ...d,
          spans: (d.spans ?? []).map((s: SpanIn) => ({ ...s, h: h0, b: b0 })),
        };

        // Aplicar preferencia de acero
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

        return normalizeDev(incoming, appCfg);
      });

      setDevelopments(normalizedDevs);
      setActiveDevIdx(0);
      setSelection({ kind: 'none' });
      setDetailViewport(null);
      setConcretoLocked(false);
      if (normalizedDevs.length > 1) setExportMode('all');
      if (res.warnings?.length) setWarning(res.warnings.join('\n'));
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }, [dev, appCfg, defaultPref, batchImportOrder, setDevelopments, setActiveDevIdx, setBusy, setError, setWarning, setSelection, setDetailViewport, setConcretoLocked]);

  return {
    handleSaveManual,
    clearDevelopment,
    onExportDxf,
    onUploadTemplate,
    onClearTemplate,
    onImportDxfFile,
    onImportDxfBatchFile,
    applyJsonToForm,
  };
}

