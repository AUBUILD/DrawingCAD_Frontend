import React, { useEffect, useRef } from 'react';

interface Props {
  title: string;
  anchorX: number;
  anchorY: number;
  containerRect: DOMRect | null;
  onClose: () => void;
  children: React.ReactNode;
}

/**
 * Reusable popover shell that positions itself near an anchor point,
 * clamped inside the container bounds. Closes on Escape.
 */
export const PopoverShell: React.FC<Props> = ({ title, anchorX, anchorY, containerRect, onClose, children }) => {
  const ref = useRef<HTMLDivElement>(null);

  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); e.stopPropagation(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    // Delay to avoid the same click that opened the popover from closing it
    const timer = setTimeout(() => window.addEventListener('pointerdown', handler), 50);
    return () => { clearTimeout(timer); window.removeEventListener('pointerdown', handler); };
  }, [onClose]);

  // Compute position relative to container, avoiding overflow
  const cw = containerRect?.width ?? 800;
  const ch = containerRect?.height ?? 600;
  const popW = 300;
  const popH = 260;
  let left = anchorX + 14;
  let top = anchorY - 30;
  if (left + popW > cw - 8) left = anchorX - popW - 14;
  if (left < 4) left = 4;
  if (top + popH > ch - 8) top = ch - popH - 8;
  if (top < 4) top = 4;

  return (
    <div
      ref={ref}
      className="soPopover"
      style={{ left, top }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="soPopoverHeader">
        <span className="soPopoverTitle">{title}</span>
        <button className="soPopoverClose" onClick={onClose} title="Cerrar (Esc)">×</button>
      </div>
      {children}
    </div>
  );
};
