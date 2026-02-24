import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import type { DevelopmentIn, PreviewResponse, SpanIn, NodeIn, BastonCfg, StirrupsDistributionIn, StirrupsSectionIn } from '../../types';
import { canvasMapper, type Bounds } from '../../services/canvasService';
import { computeNodeOrigins, computeSpanMidX, computeSpanRangeX } from '../../services/geometryService';
import { SpanSteelPopover, NodeEndPopover } from './AceroCorrPopover';
import { SpanBastonesPopover, NodeBastonesPopover } from './BastonesPopover';
import { EstribosPopover } from './EstribosPopover';
import './steelOverlay.css';

// ============================================================================
// Types
// ============================================================================
export type SteelOverlayLayer = 'acero' | 'bastones' | 'estribos';

type PopoverId =
  | { kind: 'span-steel'; spanIdx: number }
  | { kind: 'node-end'; nodeIdx: number; side: 'top' | 'bottom'; end: 1 | 2 }
  | { kind: 'span-bastones'; spanIdx: number; side: 'top' | 'bottom'; zone: 'z1' | 'z2' | 'z3' }
  | { kind: 'node-bastones'; nodeIdx: number; side: 'top' | 'bottom'; end: 1 | 2 }
  | { kind: 'estribos'; spanIdx: number }
  | null;

export interface SteelOverlayProps {
  dev: DevelopmentIn;
  preview: PreviewResponse | null;
  renderBounds: Bounds | null;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  layer: SteelOverlayLayer;
  yScale?: number;

  // Callbacks that write to existing state (spans[]/nodes[])
  onUpdateSpanSteel: (spanIdx: number, side: 'top' | 'bottom', patch: Partial<{ qty: number; diameter: string }>) => void;
  onUpdateNode: (nodeIdx: number, patch: Partial<NodeIn>) => void;
  onUpdateBaston: (spanIdx: number, side: 'top' | 'bottom', zone: 'z1' | 'z2' | 'z3', patch: Partial<BastonCfg>) => void;
  onUpdateStirrups: (spanIdx: number, patch: Partial<StirrupsDistributionIn>) => void;
  onUpdateStirrupsSection: (spanIdx: number, patch: Partial<StirrupsSectionIn>) => void;
}

// ============================================================================
// Icon positioning helpers
// ============================================================================
function useCanvasGeometry(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  renderBounds: Bounds | null,
  yScale: number,
) {
  const [canvasRect, setCanvasRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const update = () => setCanvasRect(el.getBoundingClientRect());
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [canvasRef]);

  const toCSS = useCallback((worldX: number, worldY: number): [number, number] | null => {
    const el = canvasRef.current;
    if (!el || !renderBounds) return null;
    const rect = el.getBoundingClientRect();
    const cssW = Math.max(1, Math.round(rect.width));
    const cssH = Math.max(1, Math.round(rect.height));
    const { toCanvas } = canvasMapper(renderBounds, cssW, cssH);
    let [cx, cy] = toCanvas(worldX, worldY);
    if (yScale !== 1) {
      const midY = cssH / 2;
      cy = midY + (cy - midY) * yScale;
    }
    return [cx, cy];
  }, [canvasRef, renderBounds, yScale]);

  return { canvasRect, toCSS };
}

// ============================================================================
// Main SteelOverlay Component
// ============================================================================
const SteelOverlayInner: React.FC<SteelOverlayProps> = ({
  dev, preview, renderBounds, canvasRef, layer, yScale = 1,
  onUpdateSpanSteel, onUpdateNode, onUpdateBaston, onUpdateStirrups, onUpdateStirrupsSection,
}) => {
  const [popover, setPopover] = useState<PopoverId>(null);
  const [popoverAnchor, setPopoverAnchor] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const wrapRef = useRef<HTMLDivElement>(null);

  const { canvasRect, toCSS } = useCanvasGeometry(canvasRef, renderBounds, yScale);

  const spans = dev.spans ?? [];
  const nodes = dev.nodes ?? [];
  const origins = useMemo(() => computeNodeOrigins(dev), [dev]);

  const closePopover = useCallback(() => setPopover(null), []);

  // Close popover when layer changes
  useEffect(() => { setPopover(null); }, [layer]);

  // Build icon data based on active layer
  const icons = useMemo(() => {
    if (!renderBounds || !origins.length) return [];
    const out: Array<{
      id: string;
      worldX: number;
      worldY: number;
      offsetX: number; // CSS px offset (positive = rightward)
      offsetY: number; // CSS px offset (positive = downward on screen)
      label: string;
      variant: string;
      onClick: (cssX: number, cssY: number) => void;
    }> = [];

    const boundsH = renderBounds.max_y - renderBounds.min_y;
    const yTop = renderBounds.max_y;
    const yBot = renderBounds.min_y;
    const yMid = (yTop + yBot) / 2;

    if (layer === 'acero') {
      // Span icons: one per span, above the beam
      for (let i = 0; i < spans.length; i++) {
        const mx = computeSpanMidX(dev, origins, i);
        out.push({
          id: `span-steel-${i}`,
          worldX: mx, worldY: yTop,
          offsetX: 0, offsetY: -28,
          label: `T${i + 1}`,
          variant: 'soIcon--acero',
          onClick: (cx, cy) => {
            setPopoverAnchor({ x: cx, y: cy });
            setPopover({ kind: 'span-steel', spanIdx: i });
          },
        });
      }
      // Node icons: positioned at the span corner (edge) each end belongs to
      for (let i = 0; i < nodes.length; i++) {
        const isFirst = i === 0;
        const isLast = i === nodes.length - 1;

        const ends: Array<{ end: 1 | 2; wx: number; lbl: string }> = [];
        if (!isFirst) ends.push({ end: 1, wx: computeSpanRangeX(dev, origins, i - 1).x2, lbl: `←` });
        if (!isLast) ends.push({ end: 2, wx: computeSpanRangeX(dev, origins, i).x1, lbl: `→` });

        for (const { end, wx, lbl } of ends) {
          // Top
          out.push({
            id: `node-end-top-${end}-${i}`,
            worldX: wx, worldY: yTop,
            offsetX: 0, offsetY: -50,
            label: lbl,
            variant: 'soIcon--acero soIconNode',
            onClick: (cx, cy) => {
              setPopoverAnchor({ x: cx, y: cy });
              setPopover({ kind: 'node-end', nodeIdx: i, side: 'top', end });
            },
          });
          // Bottom
          out.push({
            id: `node-end-bot-${end}-${i}`,
            worldX: wx, worldY: yBot,
            offsetX: 0, offsetY: 50,
            label: lbl,
            variant: 'soIcon--acero soIconNode',
            onClick: (cx, cy) => {
              setPopoverAnchor({ x: cx, y: cy });
              setPopover({ kind: 'node-end', nodeIdx: i, side: 'bottom', end });
            },
          });
        }
      }
    }

    if (layer === 'bastones') {
      const ZONES: Array<{ zone: 'z1' | 'z2' | 'z3'; label: string }> = [
        { zone: 'z1', label: 'Z1' },
        { zone: 'z2', label: 'Z2' },
        { zone: 'z3', label: 'Z3' },
      ];

      // 3 zone icons per side per span (6 total per span)
      for (let i = 0; i < spans.length; i++) {
        const { x1, x2 } = computeSpanRangeX(dev, origins, i);
        const third = (x2 - x1) / 3;
        const zoneX = {
          z1: x1 + third / 2,
          z2: (x1 + x2) / 2,
          z3: x2 - third / 2,
        };

        for (const { zone, label } of ZONES) {
          const wx = zoneX[zone];
          // Top icon
          out.push({
            id: `span-bast-top-${zone}-${i}`,
            worldX: wx, worldY: yTop,
            offsetX: 0, offsetY: -28,
            label,
            variant: `soIcon--bastones soIcon--${zone}`,
            onClick: (cx, cy) => {
              setPopoverAnchor({ x: cx, y: cy });
              setPopover({ kind: 'span-bastones', spanIdx: i, side: 'top', zone });
            },
          });
          // Bottom icon
          out.push({
            id: `span-bast-bot-${zone}-${i}`,
            worldX: wx, worldY: yBot,
            offsetX: 0, offsetY: 28,
            label,
            variant: `soIcon--bastones soIcon--${zone}`,
            onClick: (cx, cy) => {
              setPopoverAnchor({ x: cx, y: cy });
              setPopover({ kind: 'span-bastones', spanIdx: i, side: 'bottom', zone });
            },
          });
        }
      }

      // Node icons: positioned at the span corner (edge) each end belongs to
      for (let i = 0; i < nodes.length; i++) {
        const isFirst = i === 0;
        const isLast = i === nodes.length - 1;

        const ends: Array<{ end: 1 | 2; wx: number; lbl: string }> = [];
        if (!isFirst) ends.push({ end: 1, wx: computeSpanRangeX(dev, origins, i - 1).x2, lbl: `←` });
        if (!isLast) ends.push({ end: 2, wx: computeSpanRangeX(dev, origins, i).x1, lbl: `→` });

        for (const { end, wx, lbl } of ends) {
          // Top
          out.push({
            id: `node-bast-top-${end}-${i}`,
            worldX: wx, worldY: yTop,
            offsetX: 0, offsetY: -28,
            label: lbl,
            variant: 'soIcon--bastones',
            onClick: (cx, cy) => {
              setPopoverAnchor({ x: cx, y: cy });
              setPopover({ kind: 'node-bastones', nodeIdx: i, side: 'top', end });
            },
          });
          // Bottom
          out.push({
            id: `node-bast-bot-${end}-${i}`,
            worldX: wx, worldY: yBot,
            offsetX: 0, offsetY: 28,
            label: lbl,
            variant: 'soIcon--bastones',
            onClick: (cx, cy) => {
              setPopoverAnchor({ x: cx, y: cy });
              setPopover({ kind: 'node-bastones', nodeIdx: i, side: 'bottom', end });
            },
          });
        }
      }
    }

    if (layer === 'estribos') {
      // One icon per span, centered
      for (let i = 0; i < spans.length; i++) {
        const mx = computeSpanMidX(dev, origins, i);
        out.push({
          id: `stirrup-${i}`,
          worldX: mx, worldY: yTop,
          offsetX: 0, offsetY: -28,
          label: `E${i + 1}`,
          variant: 'soIcon--estribos',
          onClick: (cx, cy) => {
            setPopoverAnchor({ x: cx, y: cy });
            setPopover({ kind: 'estribos', spanIdx: i });
          },
        });
      }
    }

    return out;
  }, [layer, dev, spans, nodes, origins, renderBounds]);

  // Compute CSS positions for icons
  const iconPositions = useMemo(() => {
    return icons.map((icon) => {
      const pos = toCSS(icon.worldX, icon.worldY);
      if (!pos) return null;
      return { ...icon, cssX: pos[0] + icon.offsetX, cssY: pos[1] + icon.offsetY };
    }).filter(Boolean) as Array<typeof icons[0] & { cssX: number; cssY: number }>;
  }, [icons, toCSS]);

  // Which popover icon is active
  const isActive = useCallback((id: string) => {
    if (!popover) return false;
    if (popover.kind === 'span-steel') return id === `span-steel-${popover.spanIdx}`;
    if (popover.kind === 'node-end') return id === `node-end-${popover.side}-${popover.end}-${popover.nodeIdx}`;
    if (popover.kind === 'span-bastones') return id === `span-bast-${popover.side}-${popover.zone}-${popover.spanIdx}`;
    if (popover.kind === 'node-bastones') return id === `node-bast-${popover.side}-${popover.end}-${popover.nodeIdx}`;
    if (popover.kind === 'estribos') return id === `stirrup-${popover.spanIdx}`;
    return false;
  }, [popover]);

  // Get container rect for popover positioning
  const wrapRect = wrapRef.current?.getBoundingClientRect() ?? null;

  if (!preview || !renderBounds) return null;

  return (
    <div ref={wrapRef} className="steelOverlayWrap">
      {/* Icons */}
      {iconPositions.map((icon) => (
        <button
          key={icon.id}
          className={`soIcon ${icon.variant} ${isActive(icon.id) ? 'soIconActive' : ''}`}
          style={{ left: icon.cssX - 11, top: icon.cssY - 11 }}
          onClick={(e) => {
            e.stopPropagation();
            if (isActive(icon.id)) { closePopover(); return; }
            icon.onClick(icon.cssX, icon.cssY);
          }}
          title={icon.label}
          type="button"
        >
          {icon.label.length <= 3 ? icon.label : icon.label[0]}
        </button>
      ))}

      {/* Popover */}
      {popover?.kind === 'span-steel' && (
        <SpanSteelPopover
          spanIdx={popover.spanIdx}
          span={spans[popover.spanIdx]}
          anchorX={popoverAnchor.x}
          anchorY={popoverAnchor.y}
          containerRect={wrapRect}
          onClose={closePopover}
          onUpdateSpanSteel={onUpdateSpanSteel}
        />
      )}

      {popover?.kind === 'node-end' && (
        <NodeEndPopover
          nodeIdx={popover.nodeIdx}
          node={nodes[popover.nodeIdx]}
          side={popover.side}
          end={popover.end}
          anchorX={popoverAnchor.x}
          anchorY={popoverAnchor.y}
          containerRect={wrapRect}
          onClose={closePopover}
          onUpdateNode={onUpdateNode}
        />
      )}

      {popover?.kind === 'span-bastones' && (
        <SpanBastonesPopover
          spanIdx={popover.spanIdx}
          span={spans[popover.spanIdx]}
          side={popover.side}
          zone={popover.zone}
          anchorX={popoverAnchor.x}
          anchorY={popoverAnchor.y}
          containerRect={wrapRect}
          onClose={closePopover}
          onUpdateBaston={onUpdateBaston}
        />
      )}

      {popover?.kind === 'node-bastones' && (
        <NodeBastonesPopover
          nodeIdx={popover.nodeIdx}
          node={nodes[popover.nodeIdx]}
          side={popover.side}
          end={popover.end}
          anchorX={popoverAnchor.x}
          anchorY={popoverAnchor.y}
          containerRect={wrapRect}
          onClose={closePopover}
          onUpdateNode={onUpdateNode}
        />
      )}

      {popover?.kind === 'estribos' && (
        <EstribosPopover
          spanIdx={popover.spanIdx}
          span={spans[popover.spanIdx]}
          anchorX={popoverAnchor.x}
          anchorY={popoverAnchor.y}
          containerRect={wrapRect}
          onClose={closePopover}
          onUpdateStirrups={onUpdateStirrups}
          onUpdateStirrupsSection={onUpdateStirrupsSection}
        />
      )}
    </div>
  );
};

export const SteelOverlay = React.memo(SteelOverlayInner);
