import { useEffect } from 'react';
import type { DevelopmentIn } from '../types';
import type { AppConfig, PersonalizadoPayloadV1 } from '../services';
import {
  normalizeDev,
  readPersonalizado,
  DEFAULT_APP_CFG,
  PERSONALIZADO_KEY,
} from '../services';
import {
  applyBasicPreferenceToNodes,
  applyBasicPreferenceToSpans,
  applyBasicBastonesPreferenceToNodes,
  applyBasicBastonesPreferenceToSpans,
} from '../services/steelService';
import { fetchState, saveState, getTemplateDxf } from '../api';
import {
  clampNumber,
  safeSetLocalStorage,
  toJson,
  type DefaultPreferenceId,
} from '../utils';

interface UseInitDataParams {
  dev: DevelopmentIn;
  setDev: React.Dispatch<React.SetStateAction<DevelopmentIn>>;
  appCfg: AppConfig;
  setAppCfg: React.Dispatch<React.SetStateAction<AppConfig>>;
  defaultPref: DefaultPreferenceId;
  applyBasicoPreference: () => void;
  applyBasicoBastonesPreference: () => void;
  applyPersonalizadoPreference: (p: PersonalizadoPayloadV1 | null) => void;
  setJsonText: React.Dispatch<React.SetStateAction<string>>;
  payload: any;
  setSaveStatus: React.Dispatch<React.SetStateAction<'saved' | 'saving' | 'error' | null>>;
  setTemplateName: React.Dispatch<React.SetStateAction<string | null>>;
  setTemplateLayers: React.Dispatch<React.SetStateAction<string[]>>;
  // Personalizado auto-save deps
  cascoLayer: string;
  steelLayer: string;
  drawSteel: boolean;
  hookLegDraft: string;
  steelTextLayerDraft: string;
  steelTextStyleDraft: string;
  steelTextHeightDraft: string;
  steelTextWidthDraft: string;
  steelTextObliqueDraft: string;
  steelTextRotationDraft: string;
  slabProjOffsetDraft: string;
  slabProjLayerDraft: string;
}

export function useInitData({
  dev,
  setDev,
  appCfg,
  setAppCfg,
  defaultPref,
  applyBasicoPreference,
  applyBasicoBastonesPreference,
  applyPersonalizadoPreference,
  setJsonText,
  payload,
  setSaveStatus,
  setTemplateName,
  setTemplateLayers,
  cascoLayer,
  steelLayer,
  drawSteel,
  hookLegDraft,
  steelTextLayerDraft,
  steelTextStyleDraft,
  steelTextHeightDraft,
  steelTextWidthDraft,
  steelTextObliqueDraft,
  steelTextRotationDraft,
  slabProjOffsetDraft,
  slabProjLayerDraft,
}: UseInitDataParams) {

  // Cargar estado persistido (si existe backend/DB). Ignora fallos.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let loaded = false;
      try {
        const stored = await fetchState();
        if (cancelled) return;
        if (stored?.developments?.length) {
          loaded = true;
          const incoming = stored.developments[0];
          const nextCfg: AppConfig = {
            d: clampNumber(incoming.d ?? DEFAULT_APP_CFG.d, DEFAULT_APP_CFG.d),
            unit_scale: clampNumber(incoming.unit_scale ?? DEFAULT_APP_CFG.unit_scale, DEFAULT_APP_CFG.unit_scale),
            x0: clampNumber(incoming.x0 ?? DEFAULT_APP_CFG.x0, DEFAULT_APP_CFG.x0),
            y0: clampNumber(incoming.y0 ?? DEFAULT_APP_CFG.y0, DEFAULT_APP_CFG.y0),
            recubrimiento: clampNumber(
              (incoming as any).recubrimiento
                ?? (incoming as any).steel_cover_top
                ?? (incoming as any).steel_cover_bottom
                ?? DEFAULT_APP_CFG.recubrimiento,
              DEFAULT_APP_CFG.recubrimiento
            ),
            baston_Lc: clampNumber(
              (incoming as any).baston_Lc ?? (incoming as any).bastonLc ?? DEFAULT_APP_CFG.baston_Lc,
              DEFAULT_APP_CFG.baston_Lc
            ),
          };
          setAppCfg(nextCfg);

          // Aplicar preferencia ANTES de normalizar
          let finalIncoming = incoming;
          if (defaultPref === 'basico' || defaultPref === 'basico_bastones') {
            const applyNodes = defaultPref === 'basico_bastones' ? applyBasicBastonesPreferenceToNodes : applyBasicPreferenceToNodes;
            const applySpans = defaultPref === 'basico_bastones' ? applyBasicBastonesPreferenceToSpans : applyBasicPreferenceToSpans;
            const updatedNodes = incoming.nodes && incoming.nodes.length > 0
              ? applyNodes([...incoming.nodes])
              : incoming.nodes;
            const updatedSpans = incoming.spans && incoming.spans.length > 0
              ? applySpans([...incoming.spans])
              : incoming.spans;
            finalIncoming = { ...incoming, nodes: updatedNodes, spans: updatedSpans };
          }

          setDev(normalizeDev(finalIncoming, nextCfg));
          setJsonText(toJson(stored));
        }
      } catch {
        // ignore
      } finally {
        if (cancelled) return;
        if (loaded) return;
        // Si no hay estado persistido, aplicar preferencia por defecto.
        if (defaultPref === 'basico_bastones') {
          applyBasicoBastonesPreference();
        } else if (defaultPref === 'basico') {
          applyBasicoPreference();
        } else {
          applyPersonalizadoPreference(readPersonalizado());
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-guardar preferencia "Personalizado" (debounced) para usarla como default.
  useEffect(() => {
    if (defaultPref !== 'personalizado') return;

    const t = window.setTimeout(() => {
      const out: PersonalizadoPayloadV1 = {
        v: 1,
        appCfg,
        dev,
        exportOpts: { cascoLayer, steelLayer, drawSteel },
        drafts: {
          hookLegDraft,
          steelTextLayerDraft,
          steelTextStyleDraft,
          steelTextHeightDraft,
          steelTextWidthDraft,
          steelTextObliqueDraft,
          steelTextRotationDraft,
          slabProjOffsetDraft,
          slabProjLayerDraft,
        },
      };
      safeSetLocalStorage(PERSONALIZADO_KEY, JSON.stringify(out));
    }, 600);

    return () => window.clearTimeout(t);
  }, [
    defaultPref,
    appCfg,
    dev,
    cascoLayer,
    steelLayer,
    drawSteel,
    hookLegDraft,
    steelTextLayerDraft,
    steelTextStyleDraft,
    steelTextHeightDraft,
    steelTextWidthDraft,
    steelTextObliqueDraft,
    steelTextRotationDraft,
    slabProjOffsetDraft,
    slabProjLayerDraft,
  ]);

  // Intentar cargar info de plantilla si ya existe en backend.
  useEffect(() => {
    (async () => {
      try {
        const info = await getTemplateDxf();
        setTemplateName(info.filename);
        setTemplateLayers(info.layers ?? []);
      } catch {
        // ignore
      }
    })();
  }, []);

  // Guardar estado persistido (debounced). Ignora fallos.
  useEffect(() => {
    setSaveStatus('saving');
    const t = window.setTimeout(async () => {
      try {
        await saveState(payload);
        setSaveStatus('saved');
        // Ocultar mensaje después de 2 segundos
        setTimeout(() => setSaveStatus(null), 2000);
      } catch (err) {
        setSaveStatus('error');
        console.error('Error al guardar:', err);
        // Ocultar mensaje de error después de 4 segundos
        setTimeout(() => setSaveStatus(null), 4000);
      }
    }, 600);
    return () => window.clearTimeout(t);
  }, [payload]);
}
