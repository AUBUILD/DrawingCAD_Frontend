import { useCallback } from 'react';
import type { DevelopmentIn, ExportMode, ForceImportResponse, ForceImportTarget, PreviewRequest, SpanIn } from '../types';
import type { AppConfig } from '../services';
import { manualSaveLockRef } from './useInitData';
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
  applyStirrupsDefaultsByDesignMode,
} from '../services/steelService';
import {
  exportDxf,
  importDesignForcesBatch,
  importDesignForcesGroup,
  importDxf,
  importDxfBatch,
  saveState,
  uploadTemplateDxf,
  clearTemplateDxf,
  type VariantScope,
} from '../api';
import {
  clampNumber,
  safeParseJson,
  safeGetLocalStorage,
  type DefaultPreferenceId,
} from '../utils';
import { downloadBlob } from '../services';
import type { Selection } from '../services';
import { exportMetradoSingle, exportMetradoAll } from '../tabs/MetradoTab/metradoExport';

/** Replace the stored version of the active dev with the live version (debounce-safe). */
function replaceActiveDev(devs: DevelopmentIn[], activeDev: DevelopmentIn): DevelopmentIn[] {
  const activeName = activeDev.name;
  let replaced = false;
  return devs.map((d) => {
    if (!replaced && activeName && d.name === activeName) {
      replaced = true;
      return activeDev;
    }
    return d;
  });
}

/** Sync beam/group metadata onto a development (localStorage fallback version). */
function syncDevMetaLS(dev: any, beam: any, group: any): DevelopmentIn {
  const levelMap: Record<string, string> = { Piso: 'piso', 'Sótano': 'sotano', Azotea: 'azotea' };
  return {
    ...dev,
    name: beam.id ?? dev.name,
    floor_start: group.nivelInicial ?? dev.floor_start,
    floor_end: group.nivelFinal ?? dev.floor_end,
    level_type: levelMap[beam.type] ?? dev.level_type ?? 'piso',
  };
}

/** Collect all DevelopmentIn stored in beams' groups from localStorage.
 *  Syncs metadata (name, floors, level_type) from beam/group.
 *  Replaces the active dev with the live version (in case debounce hasn't flushed). */
function collectAllBeamDevelopments(storageKey: string, activeDev: DevelopmentIn): DevelopmentIn[] {
  try {
    const raw = safeGetLocalStorage(storageKey);
    if (!raw) return [activeDev];
    const parsed = JSON.parse(raw);
    const beams: any[] = Array.isArray(parsed?.data) ? parsed.data : (Array.isArray(parsed) ? parsed : []);
    const devs: DevelopmentIn[] = [];
    const activeName = activeDev.name;
    let replacedActive = false;
    for (const beam of beams) {
      const beamId: string = beam.id ?? '';
      for (const group of (beam.groups ?? [])) {
        if (!group.development) continue;
        // Replace stored dev with live version if beam ID matches active dev name
        if (!replacedActive && beamId && beamId === activeName) {
          devs.push(activeDev);
          replacedActive = true;
        } else {
          devs.push(syncDevMetaLS(group.development, beam, group));
        }
      }
    }
    return devs.length > 0 ? devs : [activeDev];
  } catch {
    return [activeDev];
  }
}

interface UseApiActionsParams {
  dev: DevelopmentIn;
  developments: DevelopmentIn[];
  exportMode: ExportMode;
  exportOrder: 'name' | 'location';
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
  authToken: string | null;
  variantScope: VariantScope | null;
  beamsStorageKey: string;
  allGroupDevs: DevelopmentIn[];
}

export function useApiActions({
  dev,
  developments,
  exportMode,
  exportOrder,
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
  authToken,
  variantScope,
  beamsStorageKey,
  allGroupDevs,
}: UseApiActionsParams) {

  const handleSaveManual = useCallback(async () => {
    try {
      manualSaveLockRef.current = true;
      setBusy(true);
      setSaveStatus('saving');
      await saveState(payload, { token: authToken, variant: variantScope });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus(null), 2000);
    } catch (err: any) {
      setSaveStatus('error');
      setError(err?.message ?? 'Error al guardar');
      setTimeout(() => setSaveStatus(null), 4000);
    } finally {
      manualSaveLockRef.current = false;
      setBusy(false);
    }
  }, [payload, setBusy, setSaveStatus, setError, authToken, variantScope]);

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

      if (exportMode !== 'single') {
        // Collect all developments: prefer live allGroupDevs, fallback to localStorage, then developments array
        const groupDevs = allGroupDevs.length > 0 ? replaceActiveDev(allGroupDevs, dev) : [];
        const lsDevs = groupDevs.length > 1 ? groupDevs : collectAllBeamDevelopments(beamsStorageKey, dev);
        const source = lsDevs.length > 1 ? lsDevs : (developments.length > 1 ? developments : lsDevs);

        // Filter by beam type if needed
        let devsToExport = source;
        if (exportMode === 'all_conv') {
          devsToExport = source.filter((d) => (d.beam_type ?? 'convencional') === 'convencional');
        } else if (exportMode === 'all_prefab') {
          devsToExport = source.filter((d) => d.beam_type === 'prefabricada');
        }
        if (!devsToExport.length) {
          setError('No hay vigas del tipo seleccionado para exportar.');
          return;
        }
        // Sort: by name (beam number ascending) or by location (y asc, then x asc — bottom-left first)
        const sorted = [...devsToExport].sort((a, b) => {
          if (exportOrder === 'location') {
            const ya = a.y0 ?? 0, yb = b.y0 ?? 0;
            if (ya !== yb) return ya - yb;
            return (a.x0 ?? 0) - (b.x0 ?? 0);
          }
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
  }, [payload, savedCuts, cascoLayer, steelLayer, drawSteel, dev.name, dev, developments, exportMode, exportOrder, recubrimientoM, sectionXU, quantityDisplay, setBusy, setError, beamsStorageKey, allGroupDevs]);

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

  const onImportDxfFile = useCallback(async (file: File, config?: { h?: number; b?: number }) => {
    try {
      setBusy(true);
      setError(null);
      setWarning(null);
      const res = await importDxf(file);
      // Use config h/b if provided, otherwise fall back to current span1 values.
      const span1 = (dev.spans ?? [])[0] ?? INITIAL_SPAN;
      const h0 = config?.h ?? span1.h;
      const b0 = config?.b ?? span1.b ?? INITIAL_SPAN.b ?? 0;
      let incoming: DevelopmentIn = {
        ...res.development,
        spans: (res.development.spans ?? []).map((s: SpanIn) => ({
          ...s,
          b: s.b ?? b0,
          h: s.h ?? h0,
        })),
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
      setConcretoLocked(true);
      if (res.warnings?.length) setWarning(res.warnings.join('\n'));
    } catch (e: any) {
      setError(e?.message ?? String(e));
      throw e;
    } finally {
      setBusy(false);
    }
  }, [dev, appCfg, defaultPref, setDev, setBusy, setError, setWarning, setConcretoLocked]);

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

  const onImportDxfBatchFile = useCallback(async (file: File, config?: { h?: number; b?: number }): Promise<DevelopmentIn[]> => {
    try {
      setBusy(true);
      setError(null);
      setWarning(null);
      const res = await importDxfBatch(file, batchImportOrder);
      if (!res.developments?.length) {
        setError('El DXF no contiene desarrollos validos.');
        return [];
      }

      // Use DXF-extracted b/h per span when available, fall back to config values.
      const span1 = (dev.spans ?? [])[0] ?? INITIAL_SPAN;
      const h0 = config?.h ?? span1.h;
      const b0 = config?.b ?? span1.b ?? INITIAL_SPAN.b ?? 0;

      const normalizedDevs = res.developments.map((d: DevelopmentIn) => {
        let incoming: DevelopmentIn = {
          ...d,
          spans: (d.spans ?? []).map((s: SpanIn) => ({
            ...s,
            b: s.b ?? b0,
            h: s.h ?? h0,
          })),
        };

        // Aplicar preferencia de acero (pero preservar design_mode del backend)
        if (defaultPref === 'basico' || defaultPref === 'basico_bastones') {
          const applyN = defaultPref === 'basico_bastones' ? applyBasicBastonesPreferenceToNodes : applyBasicPreferenceToNodes;
          let updatedNodes = incoming.nodes;
          let updatedSpans = [...(incoming.spans ?? [])];
          if (incoming.nodes && incoming.nodes.length > 0) {
            updatedNodes = applyN([...incoming.nodes]);
          }
          if (updatedSpans.length > 0) {
            updatedSpans = defaultPref === 'basico_bastones'
              ? applyBasicBastonesPreferenceToSpans(updatedSpans, updatedNodes)
              : applyBasicPreferenceToSpans(updatedSpans);
          }
          // Preservar design_mode del backend y asignar estribos correctos
          applyStirrupsDefaultsByDesignMode(updatedSpans);
          incoming = { ...incoming, nodes: updatedNodes, spans: updatedSpans };
        }

        return normalizeDev(incoming, appCfg);
      });

      setDevelopments(normalizedDevs);
      setActiveDevIdx(0);
      setSelection({ kind: 'none' });
      setDetailViewport(null);
      setConcretoLocked(true);
      if (normalizedDevs.length > 1) setExportMode('all');
      if (res.warnings?.length) setWarning(res.warnings.join('\n'));
      return normalizedDevs;
    } catch (e: any) {
      setError(e?.message ?? String(e));
      return [];
    } finally {
      setBusy(false);
    }
  }, [dev, appCfg, defaultPref, batchImportOrder, setDevelopments, setActiveDevIdx, setBusy, setError, setWarning, setSelection, setDetailViewport, setConcretoLocked]);

  const onImportForcesGroupFile = useCallback(async (file: File, target: ForceImportTarget): Promise<ForceImportResponse> => {
    try {
      setBusy(true);
      setError(null);
      setWarning(null);
      const response = await importDesignForcesGroup(file, target);
      if (response.warnings?.length) setWarning(response.warnings.join('\n'));
      return response;
    } catch (e: any) {
      setError(e?.message ?? String(e));
      throw e;
    } finally {
      setBusy(false);
    }
  }, [setBusy, setError, setWarning]);

  const onImportForcesBatchFile = useCallback(async (file: File, targets: ForceImportTarget[]): Promise<ForceImportResponse> => {
    try {
      setBusy(true);
      setError(null);
      setWarning(null);
      const response = await importDesignForcesBatch(file, targets);
      if (response.warnings?.length) setWarning(response.warnings.join('\n'));
      return response;
    } catch (e: any) {
      setError(e?.message ?? String(e));
      throw e;
    } finally {
      setBusy(false);
    }
  }, [setBusy, setError, setWarning]);

  const onExportMetrado = useCallback(async () => {
    try {
      setBusy(true);
      if (exportMode !== 'single') {
        // Collect all developments: prefer live allGroupDevs, fallback to localStorage, then developments array
        const groupDevs = allGroupDevs.length > 0 ? replaceActiveDev(allGroupDevs, dev) : [];
        const lsDevs = groupDevs.length > 1 ? groupDevs : collectAllBeamDevelopments(beamsStorageKey, dev);
        const source = lsDevs.length > 1 ? lsDevs : (developments.length > 1 ? developments : lsDevs);

        let devsToExport = source;
        if (exportMode === 'all_conv') {
          devsToExport = source.filter((d) => (d.beam_type ?? 'convencional') === 'convencional');
        } else if (exportMode === 'all_prefab') {
          devsToExport = source.filter((d) => d.beam_type === 'prefabricada');
        }
        if (!devsToExport.length) {
          setError('No hay vigas del tipo seleccionado para exportar.');
          return;
        }
        // Sort consistently with DXF export
        const sorted = [...devsToExport].sort((a, b) => {
          if (exportOrder === 'location') {
            const ya = a.y0 ?? 0, yb = b.y0 ?? 0;
            if (ya !== yb) return ya - yb;
            return (a.x0 ?? 0) - (b.x0 ?? 0);
          }
          const numA = parseInt((a.name ?? '').match(/\d+/)?.[0] ?? '999', 10);
          const numB = parseInt((b.name ?? '').match(/\d+/)?.[0] ?? '999', 10);
          return numA - numB;
        });
        await exportMetradoAll(sorted.map((d) => ({ dev: d, recubrimiento: d.recubrimiento ?? recubrimientoM })));
      } else {
        await exportMetradoSingle(dev, dev.recubrimiento ?? recubrimientoM);
      }
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }, [dev, developments, exportMode, exportOrder, recubrimientoM, setBusy, setError, beamsStorageKey, allGroupDevs]);

  return {
    handleSaveManual,
    clearDevelopment,
    onExportDxf,
    onExportMetrado,
    onUploadTemplate,
    onClearTemplate,
    onImportDxfFile,
    onImportDxfBatchFile,
    onImportForcesGroupFile,
    onImportForcesBatchFile,
    applyJsonToForm,
  };
}

