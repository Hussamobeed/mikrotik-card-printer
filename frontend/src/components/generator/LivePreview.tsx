import { Button } from "@/components/ui/button";
import { useGeneratorStore } from "@/stores/generatorStore";
import { PdfLayoutSettings, PrintOptions } from "@/types";
import { Grid3x3, Magnet, Maximize, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface Props {
  sampleNumber: string;
  layout: PdfLayoutSettings;
  /** What to actually render. Omit to show every element (used by the Templates page design view). */
  printOptions?: PrintOptions;
  /** Allow dragging elements to reposition them. Off by default — only the Templates editor sets this. */
  editable?: boolean;
  /** Called with a partial layout update when the user drags an element (only relevant if editable). */
  onLayoutChange?: (partial: Partial<PdfLayoutSettings>) => void;
  /** Show zoom/grid toolbar. Hidden by default in template editing mode. */
  showToolbar?: boolean;
}

const PAGE_WIDTH_MM = 210;
const PAGE_HEIGHT_MM = 297;
const MARGIN_MM = 5;
const MM_TO_PX = 3.78; // approximation at 96dpi

const DESIGN_MODE_OPTIONS: PrintOptions = {
  useSerialNumber: true,
  serialStartNumber: 1,
  useDatePrinting: true,
  useCustomText: true,
  customText: "نص اختياري",
};

type DragTarget = "text" | "serial" | "date" | "customText" | null;

export function LivePreview({
  sampleNumber,
  layout,
  printOptions = DESIGN_MODE_OPTIONS,
  editable = false,
  onLayoutChange,
  showToolbar = true,
}: Props) {
  const { zoom, setZoom, gridEnabled, toggleGrid, snapToGrid, toggleSnap, gridSize } =
    useGeneratorStore();
  const boxRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<DragTarget>(null);

  const { boxWidthPx, boxHeightPx, baseScale } = useMemo(() => {
    const availableWidth = PAGE_WIDTH_MM - 2 * MARGIN_MM;
    const availableHeight = PAGE_HEIGHT_MM - 2 * MARGIN_MM;
    const boxWidthMm =
      (availableWidth - layout.boxSpacing * (layout.columns - 1)) / layout.columns;
    const boxHeightMm =
      (availableHeight - layout.boxSpacing * (layout.rows - 1)) / layout.rows;
    const s = Math.min(1, 600 / PAGE_WIDTH_MM);
    return {
      boxWidthPx: boxWidthMm * s * MM_TO_PX,
      boxHeightPx: boxHeightMm * s * MM_TO_PX,
      baseScale: s,
    };
  }, [layout.boxSpacing, layout.columns, layout.rows]);

  const scale = baseScale * zoom;
  const today = new Date().toISOString().split("T")[0];

  function snap(value: number): number {
    if (!snapToGrid) return value;
    return Math.round(value / gridSize) * gridSize;
  }

  const handlePointerDown = useCallback(
    (target: DragTarget) => (e: React.MouseEvent | React.TouchEvent) => {
      if (!editable) return;
      e.preventDefault();
      e.stopPropagation();
      setDragging(target);
    },
    [editable]
  );

  const getEventPos = (e: React.MouseEvent | React.TouchEvent) => {
    if ("touches" in e) {
      const touch = e.touches[0] || e.changedTouches[0];
      return { clientX: touch.clientX, clientY: touch.clientY };
    }
    return { clientX: e.clientX, clientY: e.clientY };
  };

  const handlePointerMove = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (!editable || !dragging || !boxRef.current || !onLayoutChange) return;
      const pos = getEventPos(e);
      const rect = boxRef.current.getBoundingClientRect();
      const xPx = (pos.clientX - rect.left) / scale;
      const yPx = (pos.clientY - rect.top) / scale;
      const x = snap(Math.max(0, Math.round(xPx)));
      const y = snap(Math.max(0, Math.round(yPx)));

      if (dragging === "text") onLayoutChange({ textPositionX: x, textPositionY: y });
      if (dragging === "serial") onLayoutChange({ serialPositionX: x, serialPositionY: y });
      if (dragging === "date") onLayoutChange({ datePositionX: x, datePositionY: y });
      if (dragging === "customText")
        onLayoutChange({ customTextPositionX: x, customTextPositionY: y });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editable, dragging, scale, snapToGrid, gridSize, onLayoutChange]
  );

  function handlePointerUp() {
    setDragging(null);
  }

  // Global touch handlers to catch drag release outside the box
  useEffect(() => {
    if (!dragging) return;
    const handleGlobalTouchEnd = () => setDragging(null);
    window.addEventListener("touchend", handleGlobalTouchEnd);
    return () => window.removeEventListener("touchend", handleGlobalTouchEnd);
  }, [dragging]);

  const gridLines = useMemo(() => {
    if (!gridEnabled) return null;
    const stepPx = gridSize * scale;
    const cols = Math.ceil(boxWidthPx / stepPx);
    const rows = Math.ceil(boxHeightPx / stepPx);
    return (
      <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-40">
        {Array.from({ length: cols + 1 }).map((_, i) => (
          <line
            key={`v${i}`}
            x1={i * stepPx}
            y1={0}
            x2={i * stepPx}
            y2={boxHeightPx}
            stroke="hsl(var(--primary))"
            strokeWidth={0.5}
          />
        ))}
        {Array.from({ length: rows + 1 }).map((_, i) => (
          <line
            key={`h${i}`}
            x1={0}
            y1={i * stepPx}
            x2={boxWidthPx}
            y2={i * stepPx}
            stroke="hsl(var(--primary))"
            strokeWidth={0.5}
          />
        ))}
      </svg>
    );
  }, [gridEnabled, gridSize, scale, boxWidthPx, boxHeightPx]);

  const elementClass = editable
    ? "absolute cursor-move whitespace-nowrap rounded px-0.5 hover:outline hover:outline-1 hover:outline-primary"
    : "absolute whitespace-nowrap rounded px-0.5";

  return (
    <div className="space-y-3">
      {showToolbar && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => setZoom(zoom - 0.1)} title="تصغير">
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="w-12 text-center text-xs font-medium">{Math.round(zoom * 100)}%</span>
            <Button variant="ghost" size="icon" onClick={() => setZoom(zoom + 0.1)} title="تكبير">
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setZoom(1)}>
              100%
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setZoom(1)} title="ملائمة الحجم">
              <Maximize className="h-4 w-4" />
            </Button>
          </div>
          {editable && (
            <div className="flex items-center gap-1">
              <Button
                variant={gridEnabled ? "default" : "ghost"}
                size="icon"
                onClick={toggleGrid}
                title="إظهار الشبكة"
              >
                <Grid3x3 className="h-4 w-4" />
              </Button>
              <Button
                variant={snapToGrid ? "default" : "ghost"}
                size="icon"
                onClick={toggleSnap}
                title="الالتصاق بالشبكة (Snap)"
              >
                <Magnet className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-center overflow-auto rounded-lg border border-border bg-secondary/40 p-6">
        <div
          ref={boxRef}
          onMouseMove={handlePointerMove}
          onMouseUp={handlePointerUp}
          onMouseLeave={handlePointerUp}
          onTouchMove={handlePointerMove}
          onTouchEnd={handlePointerUp}
          className="relative select-none bg-center bg-no-repeat"
          style={{
            width: `${boxWidthPx * zoom}px`,
            height: `${boxHeightPx * zoom}px`,
            backgroundImage: layout.backgroundImageDataUrl
              ? `url(${layout.backgroundImageDataUrl})`
              : undefined,
            backgroundSize:
              layout.backgroundFit === "stretch"
                ? "100% 100%"
                : layout.backgroundFit === "cover"
                  ? "cover"
                  : "contain",
            backgroundColor: layout.backgroundImageDataUrl ? "transparent" : "white",
            border: layout.useBorder
              ? `${layout.borderWidth * zoom}px solid ${layout.borderColor}`
              : "1px solid hsl(var(--border))",
          }}
        >
          {editable && gridLines}

          <div
            onMouseDown={handlePointerDown("text")}
            onTouchStart={handlePointerDown("text")}
            className={elementClass}
            style={{
              left: `${layout.textPositionX * scale}px`,
              top: `${layout.textPositionY * scale}px`,
              fontSize: `${layout.textSize * scale}px`,
              color: layout.textColor,
              fontWeight: layout.fontWeight,
              fontFamily: layout.font === "Cairo" ? '"Cairo", sans-serif' : layout.font,
              textAlign: layout.textAlign,
              transform: layout.textRotation ? `rotate(${layout.textRotation}deg)` : undefined,
            }}
          >
            {sampleNumber || "12345678"}
          </div>

          {printOptions.useSerialNumber && (
            <div
              onMouseDown={handlePointerDown("serial")}
              onTouchStart={handlePointerDown("serial")}
              className={elementClass}
              style={{
                left: `${layout.serialPositionX * scale}px`,
                top: `${layout.serialPositionY * scale}px`,
                fontSize: `${layout.serialNumberSize * scale}px`,
                color: layout.serialColor,
              }}
            >
              {printOptions.serialStartNumber}
            </div>
          )}

          {printOptions.useDatePrinting && (
            <div
              onMouseDown={handlePointerDown("date")}
              onTouchStart={handlePointerDown("date")}
              className={elementClass}
              style={{
                left: `${layout.datePositionX * scale}px`,
                top: `${layout.datePositionY * scale}px`,
                fontSize: `${layout.dateSize * scale}px`,
                color: layout.dateColor,
              }}
            >
              {today}
            </div>
          )}

          {printOptions.useCustomText && (
            <div
              onMouseDown={handlePointerDown("customText")}
              onTouchStart={handlePointerDown("customText")}
              className={elementClass}
              style={{
                left: `${layout.customTextPositionX * scale}px`,
                top: `${layout.customTextPositionY * scale}px`,
                fontSize: `${layout.customTextSize * scale}px`,
                color: layout.customTextColor,
              }}
            >
              {printOptions.customText || "نص اختياري"}
            </div>
          )}
        </div>
      </div>
      {editable && (
        <p className="text-center text-xs text-muted-foreground">
          اسحب أي عنصر مباشرة على الكرت لتحديث موضعه تلقائيًا.
        </p>
      )}
    </div>
  );
}
