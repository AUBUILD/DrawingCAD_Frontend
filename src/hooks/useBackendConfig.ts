import { useEffect } from 'react';
import type { BackendAppConfig } from '../types';
import { fetchConfig, updateConfig } from '../api';
import { useDebounce } from './useDebounce';
import { clampNumber } from '../utils';

interface UseBackendConfigParams {
  backendCfg: BackendAppConfig | null;
  setBackendCfg: React.Dispatch<React.SetStateAction<BackendAppConfig | null>>;
  hookLegDraft: string;
  setHookLegDraft: React.Dispatch<React.SetStateAction<string>>;
  steelTextLayerDraft: string;
  setSteelTextLayerDraft: React.Dispatch<React.SetStateAction<string>>;
  steelTextStyleDraft: string;
  setSteelTextStyleDraft: React.Dispatch<React.SetStateAction<string>>;
  steelTextHeightDraft: string;
  setSteelTextHeightDraft: React.Dispatch<React.SetStateAction<string>>;
  steelTextWidthDraft: string;
  setSteelTextWidthDraft: React.Dispatch<React.SetStateAction<string>>;
  steelTextObliqueDraft: string;
  setSteelTextObliqueDraft: React.Dispatch<React.SetStateAction<string>>;
  steelTextRotationDraft: string;
  setSteelTextRotationDraft: React.Dispatch<React.SetStateAction<string>>;
  slabProjOffsetDraft: string;
  setSlabProjOffsetDraft: React.Dispatch<React.SetStateAction<string>>;
  slabProjLayerDraft: string;
  setSlabProjLayerDraft: React.Dispatch<React.SetStateAction<string>>;
}

export function useBackendConfig({
  backendCfg,
  setBackendCfg,
  hookLegDraft,
  setHookLegDraft,
  steelTextLayerDraft,
  setSteelTextLayerDraft,
  steelTextStyleDraft,
  setSteelTextStyleDraft,
  steelTextHeightDraft,
  setSteelTextHeightDraft,
  steelTextWidthDraft,
  setSteelTextWidthDraft,
  steelTextObliqueDraft,
  setSteelTextObliqueDraft,
  steelTextRotationDraft,
  setSteelTextRotationDraft,
  slabProjOffsetDraft,
  setSlabProjOffsetDraft,
  slabProjLayerDraft,
  setSlabProjLayerDraft,
}: UseBackendConfigParams) {

  // Cargar config global (gancho, etc). Ignora fallos.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cfg = await fetchConfig();
        if (cancelled) return;
        if (cfg && typeof cfg.hook_leg_m === 'number' && Number.isFinite(cfg.hook_leg_m)) setBackendCfg(cfg);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (backendCfg && typeof backendCfg.hook_leg_m === 'number' && Number.isFinite(backendCfg.hook_leg_m)) {
      setHookLegDraft(String(backendCfg.hook_leg_m));
    }
  }, [backendCfg?.hook_leg_m]);

  // Sync drafts desde backend (vacío = null => usar plantilla)
  useEffect(() => {
    if (!backendCfg) return;
    setSteelTextLayerDraft(String(backendCfg?.steel_text_layer ?? ''));
    setSteelTextStyleDraft(String(backendCfg?.steel_text_style ?? ''));
    setSteelTextHeightDraft(backendCfg?.steel_text_height == null ? '' : String(backendCfg.steel_text_height));
    setSteelTextWidthDraft(backendCfg?.steel_text_width == null ? '' : String(backendCfg.steel_text_width));
    setSteelTextObliqueDraft(backendCfg?.steel_text_oblique == null ? '' : String(backendCfg.steel_text_oblique));
    setSteelTextRotationDraft(backendCfg?.steel_text_rotation == null ? '' : String(backendCfg.steel_text_rotation));

    // Proyección de losa
    setSlabProjOffsetDraft(String(backendCfg?.slab_proj_offset_m ?? 0.2));
    setSlabProjLayerDraft(String(backendCfg?.slab_proj_layer ?? ''));
  }, [
    backendCfg?.steel_text_layer,
    backendCfg?.steel_text_style,
    backendCfg?.steel_text_height,
    backendCfg?.steel_text_width,
    backendCfg?.steel_text_oblique,
    backendCfg?.steel_text_rotation,
    backendCfg?.slab_proj_offset_m,
    backendCfg?.slab_proj_layer,
  ]);

  // Autosave (debounced) al modificar L6 gancho en Config.
  useDebounce(
    hookLegDraft,
    500,
    async (draft) => {
      if (!backendCfg) return;
      const current = backendCfg.hook_leg_m;
      const next = clampNumber(draft, current ?? 0.15);
      if (!Number.isFinite(next) || !Number.isFinite(current)) return;
      if (Math.abs(next - current) < 1e-9) return;

      const cfg = await updateConfig({ hook_leg_m: next });
      setBackendCfg(cfg);
    }
  );

  // Autosave (debounced) al modificar formato de texto de acero.
  useDebounce(
    {
      layer: steelTextLayerDraft,
      style: steelTextStyleDraft,
      height: steelTextHeightDraft,
      width: steelTextWidthDraft,
      oblique: steelTextObliqueDraft,
      rotation: steelTextRotationDraft,
    },
    500,
    async (drafts) => {
      if (!backendCfg) return;

      const normText = (v: string) => {
        const s = String(v ?? '').trim();
        return s ? s : null;
      };
      const normNum = (v: string) => {
        const n = Number.parseFloat(String(v ?? '').trim());
        return Number.isFinite(n) ? n : null;
      };

      const patch: Partial<BackendAppConfig> = {};
      const nextLayer = normText(drafts.layer);
      const nextStyle = normText(drafts.style);
      const nextHeight = normNum(drafts.height);
      const nextWidth = normNum(drafts.width);
      const nextOblique = normNum(drafts.oblique);
      const nextRotation = normNum(drafts.rotation);

      if ((backendCfg.steel_text_layer ?? null) !== nextLayer) patch.steel_text_layer = nextLayer;
      if ((backendCfg.steel_text_style ?? null) !== nextStyle) patch.steel_text_style = nextStyle;
      if ((backendCfg.steel_text_height ?? null) !== nextHeight) patch.steel_text_height = nextHeight;
      if ((backendCfg.steel_text_width ?? null) !== nextWidth) patch.steel_text_width = nextWidth;
      if ((backendCfg.steel_text_oblique ?? null) !== nextOblique) patch.steel_text_oblique = nextOblique;
      if ((backendCfg.steel_text_rotation ?? null) !== nextRotation) patch.steel_text_rotation = nextRotation;

      if (!Object.keys(patch).length) return;

      const cfg = await updateConfig(patch);
      setBackendCfg(cfg);
    }
  );

  // Autosave (debounced) al modificar proyección de losa.
  useDebounce(
    { offset: slabProjOffsetDraft, layer: slabProjLayerDraft },
    500,
    async (drafts) => {
      if (!backendCfg) return;

      const normText = (v: string) => {
        const s = String(v ?? '').trim();
        return s ? s : null;
      };

      const currentOffset = typeof backendCfg.slab_proj_offset_m === 'number' && Number.isFinite(backendCfg.slab_proj_offset_m) ? backendCfg.slab_proj_offset_m : 0.2;
      const nextOffsetRaw = Number.parseFloat(String(drafts.offset ?? '').trim().replace(',', '.'));
      const nextOffset = Number.isFinite(nextOffsetRaw) ? Math.max(0, nextOffsetRaw) : currentOffset;
      const nextLayer = normText(drafts.layer);

      const patch: Partial<BackendAppConfig> = {};
      if (Math.abs(nextOffset - currentOffset) > 1e-9) patch.slab_proj_offset_m = nextOffset;
      if ((backendCfg.slab_proj_layer ?? null) !== nextLayer) patch.slab_proj_layer = nextLayer;
      if (!Object.keys(patch).length) return;

      const cfg = await updateConfig(patch);
      setBackendCfg(cfg);
    }
  );
}
