import React, { useState, useRef, useEffect } from 'react';

interface EditableCellProps {
  value: number;
  readOnly?: boolean;
  fmt: (v: number) => string;
  parse: (raw: string, fallback: number) => number;
  onChange: (v: number) => void;
  onFocus?: (e: React.FocusEvent<HTMLInputElement>) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  className?: string;
  'data-grid'?: string;
  'data-row'?: number;
  'data-col'?: number;
}

/**
 * Input numérico que permite escritura libre mientras se edita.
 * Muestra el valor formateado cuando NO está enfocado.
 * Al enfocar, muestra el valor raw para edición libre.
 * Al desenfocar (blur), parsea, valida y formatea.
 */
export const EditableCell: React.FC<EditableCellProps> = ({
  value,
  readOnly,
  fmt,
  parse,
  onChange,
  onFocus,
  onKeyDown,
  className,
  ...dataAttrs
}) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync draft when value changes externally while not editing
  useEffect(() => {
    if (!editing) {
      setDraft(fmt(value));
    }
  }, [value, editing, fmt]);

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    if (readOnly) return;
    setEditing(true);
    setDraft(fmt(value));
    onFocus?.(e);
    // Select all text after React updates the input
    requestAnimationFrame(() => inputRef.current?.select());
  };

  const commit = () => {
    setEditing(false);
    const parsed = parse(draft, value);
    if (parsed !== value) {
      onChange(parsed);
    }
    setDraft(fmt(parsed));
  };

  const handleBlur = () => {
    commit();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      commit();
      inputRef.current?.blur();
      return;
    }
    if (e.key === 'Escape') {
      setEditing(false);
      setDraft(fmt(value));
      inputRef.current?.blur();
      return;
    }
    onKeyDown?.(e);
  };

  return (
    <input
      ref={inputRef}
      className={className}
      type="text"
      inputMode="decimal"
      value={editing ? draft : fmt(value)}
      readOnly={readOnly}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      {...dataAttrs}
    />
  );
};
