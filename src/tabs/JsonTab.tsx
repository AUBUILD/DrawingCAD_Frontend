import React from 'react';

export interface JsonTabProps {
  jsonText: string;
  setJsonText: (text: string) => void;
  onApply: () => void;
}

export const JsonTab: React.FC<JsonTabProps> = ({ jsonText, setJsonText, onApply }) => {
  return (
    <div className="form">
      <div className="rowBetween">
        <div className="muted">Editar JSON. Boton aplica al formulario.</div>
        <button className="btnSmall" type="button" onClick={onApply}>
          Aplicar
        </button>
      </div>
      <textarea className="editor" value={jsonText} onChange={(e) => setJsonText(e.target.value)} />
    </div>
  );
};
