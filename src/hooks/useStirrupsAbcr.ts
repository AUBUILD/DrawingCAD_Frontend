import { useState } from 'react';

// Hook para manejar edición de ABCR de estribos por campo
export function useStirrupsAbcr() {
  const [stirrupsAbcrEdits, setStirrupsAbcrEdits] = useState<Record<string, string>>({});

  // Limpia el draft de un campo específico
  function clearAbcrField(key: string) {
    setStirrupsAbcrEdits((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  // Setea el valor de un campo específico
  function setAbcrField(key: string, value: string) {
    setStirrupsAbcrEdits((prev) => ({ ...prev, [key]: value }));
  }

  return {
    stirrupsAbcrEdits,
    setStirrupsAbcrEdits,
    clearAbcrField,
    setAbcrField,
  };
}
