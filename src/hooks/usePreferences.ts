import { useCallback } from 'react';
import type { DevelopmentIn } from '../types';
import type { AppConfig, PersonalizadoPayloadV1 } from '../services';
import {
  normalizeDev,
  readPersonalizado,
  PERSONALIZADO_KEY,
} from '../services';
import {
  applyBasicPreferenceToNodes,
  applyBasicPreferenceToSpans,
  applyBasicBastonesPreferenceToNodes,
  applyBasicBastonesPreferenceToSpans,
} from '../services/steelService';
import {
  safeSetLocalStorage,
  type DefaultPreferenceId,
} from '../utils';

interface UsePreferencesParams {
  dev: DevelopmentIn;
  setDev: React.Dispatch<React.SetStateAction<DevelopmentIn>>;
  appCfg: AppConfig;
  setAppCfg: React.Dispatch<React.SetStateAction<AppConfig>>;
  setHookLegDraft: React.Dispatch<React.SetStateAction<string>>;
  setSlabProjOffsetDraft: React.Dispatch<React.SetStateAction<string>>;
  setSlabProjLayerDraft: React.Dispatch<React.SetStateAction<string>>;
  setSteelTextLayerDraft: React.Dispatch<React.SetStateAction<string>>;
  setSteelTextStyleDraft: React.Dispatch<React.SetStateAction<string>>;
  setSteelTextHeightDraft: React.Dispatch<React.SetStateAction<string>>;
  setSteelTextWidthDraft: React.Dispatch<React.SetStateAction<string>>;
  setSteelTextObliqueDraft: React.Dispatch<React.SetStateAction<string>>;
  setSteelTextRotationDraft: React.Dispatch<React.SetStateAction<string>>;
  setCascoLayer: React.Dispatch<React.SetStateAction<string>>;
  setSteelLayer: React.Dispatch<React.SetStateAction<string>>;
  setDrawSteel: React.Dispatch<React.SetStateAction<boolean>>;
  defaultPref: DefaultPreferenceId;
  setDefaultPref: React.Dispatch<React.SetStateAction<DefaultPreferenceId>>;
  hookLegDraft: string;
  steelTextLayerDraft: string;
  steelTextStyleDraft: string;
  steelTextHeightDraft: string;
  steelTextWidthDraft: string;
  steelTextObliqueDraft: string;
  steelTextRotationDraft: string;
  slabProjOffsetDraft: string;
  slabProjLayerDraft: string;
  cascoLayer: string;
  steelLayer: string;
  drawSteel: boolean;
}

export function usePreferences({
  dev,
  setDev,
  appCfg,
  setAppCfg,
  setHookLegDraft,
  setSlabProjOffsetDraft,
  setSlabProjLayerDraft,
  setSteelTextLayerDraft,
  setSteelTextStyleDraft,
  setSteelTextHeightDraft,
  setSteelTextWidthDraft,
  setSteelTextObliqueDraft,
  setSteelTextRotationDraft,
  setCascoLayer,
  setSteelLayer,
  setDrawSteel,
  defaultPref,
  setDefaultPref,
  hookLegDraft,
  steelTextLayerDraft,
  steelTextStyleDraft,
  steelTextHeightDraft,
  steelTextWidthDraft,
  steelTextObliqueDraft,
  steelTextRotationDraft,
  slabProjOffsetDraft,
  slabProjLayerDraft,
  cascoLayer,
  steelLayer,
  drawSteel,
}: UsePreferencesParams) {

  const applyBasicoPreference = useCallback(() => {
    // Verificar si hay geometría existente ANTES de modificar cualquier estado
    const hasExistingGeometry = (dev.nodes ?? []).length > 0 || (dev.spans ?? []).length > 0;

    if (!hasExistingGeometry) {
      // Si NO hay geometría existente, configurar parámetros por defecto
      setAppCfg((p) => ({
        ...p,
        d: 0.25,
        unit_scale: 2,
        x0: 0,
        y0: 0,
        recubrimiento: 0.04,
        baston_Lc: 0.45,
      }));
      setHookLegDraft('0.15');
      setSlabProjOffsetDraft('0.20');
      setSlabProjLayerDraft('-- SECCION CORTE');
      setCascoLayer('-- SECCION CORTE');
      setSteelLayer('FIERRO');
      // No hay geometría, salir
      return;
    }

    // Si hay geometría existente, SOLO actualizar configuración de acero
    // NO modificar appCfg para preservar la geometría
    setDev((prev) => {
      const currentNodes = prev.nodes ?? [];
      const currentSpans = prev.spans ?? [];
      if (currentNodes.length === 0) return prev;

      // Aplicar configuración a nodos (ganchos, anclajes 75cm/60cm)
      const updatedNodes = applyBasicPreferenceToNodes([...currentNodes]);

      // Aplicar configuración a spans (acero corrido 2Ø5/8")
      const updatedSpans = applyBasicPreferenceToSpans([...currentSpans]);

      // Retornar sin normalizar para no afectar la geometría
      return { ...prev, nodes: updatedNodes, spans: updatedSpans };
    });
  }, [dev, setDev, setAppCfg, setHookLegDraft, setSlabProjOffsetDraft, setSlabProjLayerDraft, setCascoLayer, setSteelLayer]);

  const applyBasicoBastonesPreference = useCallback(() => {
    const hasExistingGeometry = (dev.nodes ?? []).length > 0 || (dev.spans ?? []).length > 0;

    if (!hasExistingGeometry) {
      // Mismos defaults globales que Pref 01
      setAppCfg((p) => ({
        ...p,
        d: 0.25,
        unit_scale: 2,
        x0: 0,
        y0: 0,
        recubrimiento: 0.04,
        baston_Lc: 0.45,
      }));
      setHookLegDraft('0.15');
      setSlabProjOffsetDraft('0.20');
      setSlabProjLayerDraft('-- SECCION CORTE');
      setCascoLayer('-- SECCION CORTE');
      setSteelLayer('FIERRO');
      return;
    }

    setDev((prev) => {
      const currentNodes = prev.nodes ?? [];
      const currentSpans = prev.spans ?? [];
      if (currentNodes.length === 0) return prev;

      // Pref 02: acero corrido + bastones + nodo bastones
      const updatedNodes = applyBasicBastonesPreferenceToNodes([...currentNodes]);
      const updatedSpans = applyBasicBastonesPreferenceToSpans([...currentSpans]);

      return { ...prev, nodes: updatedNodes, spans: updatedSpans };
    });
  }, [dev, setDev, setAppCfg, setHookLegDraft, setSlabProjOffsetDraft, setSlabProjLayerDraft, setCascoLayer, setSteelLayer]);

  const applyPersonalizadoPreference = useCallback((p: PersonalizadoPayloadV1 | null) => {
    if (!p) return;

    // Verificar si hay geometría existente
    const hasExistingGeometry = (dev.nodes ?? []).length > 0 || (dev.spans ?? []).length > 0;

    if (hasExistingGeometry) {
      // Si hay geometría existente, SOLO aplicar parámetros que NO afectan la geometría
      // Preservar d, unit_scale, x0, y0 para mantener la geometría intacta
      setAppCfg((prev) => ({
        ...prev,
        // NO cambiar: d, unit_scale, x0, y0 (preservan geometría)
        recubrimiento: p.appCfg.recubrimiento,
        baston_Lc: p.appCfg.baston_Lc,
      }));
    } else {
      // Si NO hay geometría, aplicar toda la configuración
      setAppCfg(p.appCfg);
      setDev(normalizeDev(p.dev, p.appCfg));
    }

    // Aplicar drafts y exportOpts (no afectan geometría)
    setHookLegDraft(p.drafts.hookLegDraft);
    setSteelTextLayerDraft(p.drafts.steelTextLayerDraft);
    setSteelTextStyleDraft(p.drafts.steelTextStyleDraft);
    setSteelTextHeightDraft(p.drafts.steelTextHeightDraft);
    setSteelTextWidthDraft(p.drafts.steelTextWidthDraft);
    setSteelTextObliqueDraft(p.drafts.steelTextObliqueDraft);
    setSteelTextRotationDraft(p.drafts.steelTextRotationDraft);
    setSlabProjOffsetDraft(p.drafts.slabProjOffsetDraft);
    setSlabProjLayerDraft(p.drafts.slabProjLayerDraft);
    setCascoLayer(p.exportOpts.cascoLayer);
    setSteelLayer(p.exportOpts.steelLayer);
    setDrawSteel(p.exportOpts.drawSteel);
  }, [dev, setDev, setAppCfg, setHookLegDraft, setSteelTextLayerDraft, setSteelTextStyleDraft, setSteelTextHeightDraft, setSteelTextWidthDraft, setSteelTextObliqueDraft, setSteelTextRotationDraft, setSlabProjOffsetDraft, setSlabProjLayerDraft, setCascoLayer, setSteelLayer, setDrawSteel]);

  const onChangeDefaultPref = useCallback((next: DefaultPreferenceId) => {
    setDefaultPref(next);
    if (next === 'basico') {
      applyBasicoPreference();
      return;
    }
    if (next === 'basico_bastones') {
      applyBasicoBastonesPreference();
      return;
    }
    const stored = readPersonalizado();
    if (stored) {
      applyPersonalizadoPreference(stored);
      return;
    }
    // Sembrar con el estado actual como "Personalizado" (sin botones extra).
    const seed: PersonalizadoPayloadV1 = {
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
    safeSetLocalStorage(PERSONALIZADO_KEY, JSON.stringify(seed));
  }, [
    setDefaultPref, appCfg, dev,
    cascoLayer, steelLayer, drawSteel,
    hookLegDraft, steelTextLayerDraft, steelTextStyleDraft,
    steelTextHeightDraft, steelTextWidthDraft, steelTextObliqueDraft,
    steelTextRotationDraft, slabProjOffsetDraft, slabProjLayerDraft,
    applyBasicoPreference, applyBasicoBastonesPreference, applyPersonalizadoPreference,
  ]);

  return {
    applyBasicoPreference,
    applyBasicoBastonesPreference,
    applyPersonalizadoPreference,
    onChangeDefaultPref,
  };
}
