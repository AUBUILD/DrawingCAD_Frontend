import { useEffect, useRef } from 'react';
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
import { fetchState, saveState, getTemplateDxf, type VariantScope } from '../api';
import {
  clampNumber,
  safeSetLocalStorage,
  toJson,
  type DefaultPreferenceId,
} from '../utils';

/** Ref compartido entre auto-save y manual-save para evitar race conditions. */
export const manualSaveLockRef = { current: false };

interface UseInitDataParams {
  dev: DevelopmentIn;
  setDev: React.Dispatch<React.SetStateAction<DevelopmentIn>>;
  setDevelopments: React.Dispatch<React.SetStateAction<DevelopmentIn[]>>;
  setActiveDevIdx: React.Dispatch<React.SetStateAction<number>>;
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
  authToken: string | null;
  variantScope: VariantScope | null;
}

export function useInitData({
  dev,
  setDev,
  setDevelopments,
  setActiveDevIdx,
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
  authToken,
  variantScope,
}: UseInitDataParams) {

  // Flag: bloquea el auto-save hasta que la carga inicial complete.
  // Evita que el payload por defecto sobreescriba los datos del backend
  // cuando hay latencia (cold start de Render/Neon).
  const initialLoadDoneRef = useRef(false);
  // Ref estable para leer defaultPref dentro del effect sin que sea dependencia reactiva.
  const defaultPrefRef = useRef(defaultPref);
  defaultPrefRef.current = defaultPref;

  // Cargar estado persistido (si existe backend/DB). Ignora fallos.
  useEffect(() => {
    if (!authToken) return;
    // Cada vez que cambia el scope o token, marcamos que la carga aún no terminó.
    initialLoadDoneRef.current = false;
    let cancelled = false;
    (async () => {
      let loaded = false;
      try {
        const stored = await fetchState({ token: authToken, variant: variantScope });
        if (cancelled) return;
        if (stored?.developments?.length) {
          loaded = true;
          // Extraer appCfg del primer desarrollo
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

          // Normalizar TODOS los desarrollos
          const pref = defaultPrefRef.current;
          const normalizedDevs = stored.developments.map((d: DevelopmentIn) => {
            let finalD = d;
            if (pref === 'basico' || pref === 'basico_bastones') {
              const applyNodes = pref === 'basico_bastones' ? applyBasicBastonesPreferenceToNodes : applyBasicPreferenceToNodes;
              const updatedNodes = d.nodes && d.nodes.length > 0
                ? applyNodes([...d.nodes])
                : d.nodes;
              const updatedSpans = d.spans && d.spans.length > 0
                ? (pref === 'basico_bastones'
                  ? applyBasicBastonesPreferenceToSpans([...d.spans], updatedNodes ?? [])
                  : applyBasicPreferenceToSpans([...d.spans]))
                : d.spans;
              finalD = { ...d, nodes: updatedNodes, spans: updatedSpans };
            }
            return normalizeDev(finalD, nextCfg);
          });
          setDevelopments(normalizedDevs);
          setActiveDevIdx(0);
          setJsonText(toJson(stored));
        }
      } catch (err) {
        console.warn('[useInitData] Error al cargar estado persistido:', err);
      } finally {
        if (cancelled) return;
        if (!loaded) {
          // Si no hay estado persistido, aplicar preferencia por defecto.
          const pref = defaultPrefRef.current;
          if (pref === 'basico_bastones') {
            applyBasicoBastonesPreference();
          } else if (pref === 'basico') {
            applyBasicoPreference();
          } else {
            applyPersonalizadoPreference(readPersonalizado());
          }
        }
        // Desbloquear auto-save ahora que la carga terminó.
        initialLoadDoneRef.current = true;
      }
    })();

    return () => {
      cancelled = true;
    };
  // defaultPref se excluye intencionalmente: el cambio de preferencia se aplica
  // en usePreferences.onChangeDefaultPref, no necesita recargar del backend.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken, variantScope]);

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

  // Guardar estado persistido (debounced).
  // Bloqueado hasta que la carga inicial complete para evitar sobreescribir
  // datos del backend con el payload por defecto durante cold starts.
  useEffect(() => {
    if (!authToken) return;
    if (!initialLoadDoneRef.current) return;
    const t = window.setTimeout(async () => {
      // Si un manual-save está en curso, saltar este auto-save.
      if (manualSaveLockRef.current) return;
      setSaveStatus('saving');
      try {
        await saveState(payload, { token: authToken, variant: variantScope });
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus(null), 2000);
      } catch (err) {
        setSaveStatus('error');
        console.error('Error al guardar:', err);
        setTimeout(() => setSaveStatus(null), 4000);
      }
    }, 600);
    return () => window.clearTimeout(t);
  }, [payload, authToken, variantScope]);
}
