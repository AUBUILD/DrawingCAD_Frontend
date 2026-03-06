import { useState, useEffect, useCallback } from 'react';
import type { NivelType, Ordinal } from '../shared/tokens';
import { PREFIX, PAD, ORDINALS, ordIdx } from '../shared/tokens';
import type { Viga, GrupoViga, PanelView } from './types';
import type { DevelopmentIn } from '../../types';
import { safeGetLocalStorage, safeSetLocalStorage } from '../../utils/storageUtils';

/** Map DXF level_type string to NivelType */
function dxfLevelToType(level?: string): NivelType {
  if (!level) return 'Piso';
  const l = level.toLowerCase();
  if (l === 'sotano' || l === 'sótano') return 'Sótano';
  if (l === 'azotea') return 'Azotea';
  return 'Piso';
}

const STORAGE_KEY = 'drawbeam_entities';
const STORAGE_VERSION = 2;

interface StorageEnvelope {
  version: number;
  data: Viga[];
}

function loadBeams(storageKey: string): Viga[] {
  try {
    const raw = safeGetLocalStorage(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    // v2+ envelope format
    if (parsed && typeof parsed === 'object' && 'version' in parsed && 'data' in parsed) {
      return Array.isArray(parsed.data) ? parsed.data : [];
    }
    // v1 legacy: plain array
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

let _storageError = false;

function saveBeams(beams: Viga[], storageKey: string) {
  const envelope: StorageEnvelope = { version: STORAGE_VERSION, data: beams };
  try {
    safeSetLocalStorage(storageKey, JSON.stringify(envelope));
    _storageError = false;
  } catch {
    if (!_storageError) {
      _storageError = true;
      console.warn('[DrawBeam] No se pudo guardar en localStorage. Los datos pueden perderse al recargar.');
    }
  }
}

export function useBeams(storageKey = STORAGE_KEY) {
  const [beams, setBeams] = useState<Viga[]>(() => loadBeams(storageKey));
  const [selectedBeamId, setSelectedBeamId] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [view, setView] = useState<PanelView>('vigas');
  const [storageWarning, setStorageWarning] = useState(false);

  useEffect(() => {
    saveBeams(beams, storageKey);
    setStorageWarning(_storageError);
  }, [beams, storageKey]);

  useEffect(() => {
    setBeams(loadBeams(storageKey));
    setSelectedBeamId(null);
    setSelectedGroupId(null);
    setView('vigas');
  }, [storageKey]);

  const selectedBeam = beams.find((b) => b.id === selectedBeamId) ?? null;
  const selectedGroup = selectedBeam?.groups.find((g) => g.id === selectedGroupId) ?? null;

  const nextFreeNumber = useCallback((type: NivelType): number => {
    const used = beams.filter((b) => b.type === type).map((b) => b.number);
    for (let n = 1; n <= 99; n++) {
      if (!used.includes(n)) return n;
    }
    return 1;
  }, [beams]);

  const addBeam = useCallback((type: NivelType, initialGroup?: { ini: Ordinal; fin: Ordinal }) => {
    const num = nextFreeNumber(type);
    const id = `${PREFIX[type]}-${PAD(num)}`;
    const groups: GrupoViga[] = [];
    if (initialGroup && ordIdx(initialGroup.fin) > ordIdx(initialGroup.ini)) {
      const gid = crypto.randomUUID();
      groups.push({ id: gid, nivelInicial: initialGroup.ini, nivelFinal: initialGroup.fin });
    }
    const newBeam: Viga = { id, type, number: num, groups };
    setBeams((prev) => [...prev, newBeam]);
    setSelectedBeamId(id);
    setSelectedGroupId(groups[0]?.id ?? null);
    setView('editar');
    return newBeam;
  }, [nextFreeNumber]);

  /** Create multiple beams at once from batch-imported developments.
   *  Uses name/level_type/beam_no from each DevelopmentIn.
   *  Stores the development inside the first group of each beam. */
  const addBeamsBatch = useCallback((
    devs: DevelopmentIn[],
    storyRange: { ini: Ordinal; fin: Ordinal },
  ): Viga[] => {
    const newBeams: Viga[] = [];
    // Track numbers used per type (include existing beams)
    const usedNums: Record<string, Set<number>> = {};
    const getUsed = (type: NivelType) => {
      if (!usedNums[type]) {
        usedNums[type] = new Set(beams.filter((b) => b.type === type).map((b) => b.number));
      }
      return usedNums[type];
    };

    for (const d of devs) {
      const type = dxfLevelToType(d.level_type);
      const used = getUsed(type);

      // Use beam_no from DXF if available and not already taken, otherwise auto-assign
      let num = d.beam_no && !used.has(d.beam_no) ? d.beam_no : undefined;
      if (!num) {
        for (let n = 1; n <= 99; n++) {
          if (!used.has(n)) { num = n; break; }
        }
        if (!num) num = 1;
      }
      used.add(num);

      const id = `${PREFIX[type]}-${PAD(num)}`;
      const gid = crypto.randomUUID();
      const groups: GrupoViga[] = [
        { id: gid, nivelInicial: storyRange.ini, nivelFinal: storyRange.fin, development: d },
      ];

      newBeams.push({ id, type, number: num, groups });
    }

    setBeams((prev) => [...prev, ...newBeams]);
    // Select the first new beam
    if (newBeams.length > 0) {
      setSelectedBeamId(newBeams[0].id);
      setSelectedGroupId(newBeams[0].groups[0]?.id ?? null);
    }
    setView('vigas');
    return newBeams;
  }, [beams]);

  const deleteBeam = useCallback((beamId: string) => {
    setBeams((prev) => prev.filter((b) => b.id !== beamId));
    if (selectedBeamId === beamId) {
      setSelectedBeamId(null);
      setSelectedGroupId(null);
      setView('vigas');
    }
  }, [selectedBeamId]);

  const deleteBeams = useCallback((beamIds: string[]) => {
    const idSet = new Set((beamIds ?? []).filter(Boolean));
    if (idSet.size === 0) return;
    setBeams((prev) => prev.filter((b) => !idSet.has(b.id)));
    if (selectedBeamId && idSet.has(selectedBeamId)) {
      setSelectedBeamId(null);
      setSelectedGroupId(null);
      setView('vigas');
    }
  }, [selectedBeamId]);

  const clearBeams = useCallback(() => {
    setBeams([]);
    setSelectedBeamId(null);
    setSelectedGroupId(null);
    setView('vigas');
  }, []);

  const groupOverlaps = useCallback((beamId: string, nivelInicial: Ordinal, nivelFinal: Ordinal): boolean => {
    const beam = beams.find((b) => b.id === beamId);
    if (!beam) return false;
    const iniI = ordIdx(nivelInicial);
    const finI = ordIdx(nivelFinal);
    return beam.groups.some((g) => {
      const gIni = ordIdx(g.nivelInicial);
      const gFin = ordIdx(g.nivelFinal);
      return iniI < gFin && finI > gIni;
    });
  }, [beams]);

  const addGroup = useCallback((beamId: string, nivelInicial: Ordinal, nivelFinal: Ordinal): string | null => {
    if (ordIdx(nivelFinal) <= ordIdx(nivelInicial)) return null;
    if (groupOverlaps(beamId, nivelInicial, nivelFinal)) return null;

    const gid = crypto.randomUUID();
    const group: GrupoViga = { id: gid, nivelInicial, nivelFinal };
    setBeams((prev) =>
      prev.map((b) =>
        b.id === beamId ? { ...b, groups: [...b.groups, group] } : b,
      ),
    );
    setSelectedGroupId(gid);
    return gid;
  }, [groupOverlaps]);

  const deleteGroup = useCallback((beamId: string, groupId: string) => {
    setBeams((prev) =>
      prev.map((b) =>
        b.id === beamId ? { ...b, groups: b.groups.filter((g) => g.id !== groupId) } : b,
      ),
    );
    if (selectedGroupId === groupId) setSelectedGroupId(null);
  }, [selectedGroupId]);

  const updateGroup = useCallback((beamId: string, groupId: string, patch: Partial<GrupoViga>) => {
    setBeams((prev) =>
      prev.map((b) =>
        b.id === beamId
          ? { ...b, groups: b.groups.map((g) => g.id === groupId ? { ...g, ...patch } : g) }
          : b,
      ),
    );
  }, []);

  const selectBeam = useCallback((beamId: string) => {
    setSelectedBeamId(beamId);
    const beam = beams.find((b) => b.id === beamId);
    setSelectedGroupId(beam?.groups[0]?.id ?? null);
    setView('editar');
  }, [beams]);

  /** Save a DevelopmentIn into the currently selected group. */
  const saveGroupDevelopment = useCallback((dev: import('../../types').DevelopmentIn) => {
    if (!selectedBeamId || !selectedGroupId) return;
    setBeams((prev) =>
      prev.map((b) =>
        b.id === selectedBeamId
          ? { ...b, groups: b.groups.map((g) => g.id === selectedGroupId ? { ...g, development: dev } : g) }
          : b,
      ),
    );
  }, [selectedBeamId, selectedGroupId]);

  return {
    beams,
    selectedBeam,
    selectedGroup,
    selectedBeamId,
    selectedGroupId,
    view,
    setView,
    addBeam,
    addBeamsBatch,
    deleteBeam,
    deleteBeams,
    clearBeams,
    addGroup,
    groupOverlaps,
    deleteGroup,
    updateGroup,
    selectBeam,
    setSelectedGroupId,
    saveGroupDevelopment,
    nextFreeNumber,
    storageWarning,
  };
}
