import { useState } from 'react';

// Hook para manejar edición de longitudes de bastones por campo
export function useBastonLen() {
  const [bastonLenEdits, setBastonLenEdits] = useState<Record<string, string>>({});

  function clearBastonLenField(key: string) {
    setBastonLenEdits((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function setBastonLenField(key: string, value: string) {
    setBastonLenEdits((prev) => ({ ...prev, [key]: value }));
  }

  return {
    bastonLenEdits,
    setBastonLenEdits,
    clearBastonLenField,
    setBastonLenField,
  };
}
