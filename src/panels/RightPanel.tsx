import React from 'react';
import { PreviewPanel, type PreviewPanelProps } from '../components/PreviewPanel';

export interface RightPanelProps {
  previewPanelProps: PreviewPanelProps;
  detailOverlay?: React.ReactNode;
}

/**
 * Wrapper persistente para el panel de visualización.
 * Garantiza que el canvas nunca se desmonte al cambiar tabs.
 */
export const RightPanel: React.FC<RightPanelProps> = ({
  previewPanelProps,
  detailOverlay,
}) => {
  return (
    <PreviewPanel
      {...previewPanelProps}
      detailOverlay={detailOverlay}
    />
  );
};
