import jsPDF from "jspdf";
import * as XLSX from "xlsx";
import { GeneratorSettings, PdfLayoutSettings, PrintOptions } from "@/types";

const jsPdfFontMap: Record<string, string> = {
  Cairo: "helvetica",
  helvetica: "helvetica",
  times: "times",
  courier: "courier",
};

function resolvePdfFont(font: string): string {
  return jsPdfFontMap[font] || "helvetica";
}

function detectImageFormat(dataUrl: string): string {
  const match = dataUrl.match(/^data:image\/(\w+);/);
  const fmt = match?.[1]?.toUpperCase();
  if (fmt === "PNG") return "PNG";
  if (fmt === "WEBP") return "WEBP";
  return "JPEG";
}

export function downloadTextFile(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  triggerDownload(blob, filename);
}

export function exportAsExcel(
  numbers: string[],
  settings: Pick<GeneratorSettings, "customer" | "profile" | "comment">,
  filename: string
) {
  const rows = numbers.map((number) => ({
    الرقم: number,
    العميل: settings.customer,
    البروفايل: settings.profile,
    التعليق: settings.comment || "",
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Numbers");
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

/** Returns the generated Excel workbook as a Blob (for saving to the Library). */
export function exportAsExcelBlob(
  numbers: string[],
  settings: Pick<GeneratorSettings, "customer" | "profile" | "comment">
): Blob {
  const rows = numbers.map((number) => ({
    الرقم: number,
    العميل: settings.customer,
    البروفايل: settings.profile,
    التعليق: settings.comment || "",
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Numbers");
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return new Blob([out], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

const PAGE_WIDTH_MM = 210;
const PAGE_HEIGHT_MM = 297;
const MARGIN_MM = 5;

function loadImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("تعذّر تحميل صورة الخلفية"));
    img.src = dataUrl;
  });
}

export async function generateCardsPdf(
  numbers: string[],
  layout: PdfLayoutSettings,
  printOptions: PrintOptions
): Promise<Blob> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  const availableWidth = PAGE_WIDTH_MM - 2 * MARGIN_MM;
  const availableHeight = PAGE_HEIGHT_MM - 2 * MARGIN_MM;
  const boxWidth = (availableWidth - layout.boxSpacing * (layout.columns - 1)) / layout.columns;
  const boxHeight = (availableHeight - layout.boxSpacing * (layout.rows - 1)) / layout.rows;
  const perPage = layout.columns * layout.rows;

  const today = new Date().toISOString().split("T")[0];
  const mmPerPx = 25.4 / 96; // convert the original px-based positions to mm

  // Preload the background image once (same image reused on every card) so we
  // know its real aspect ratio for "contain"/"cover" fitting.
  let imgDims: { width: number; height: number } | null = null;
  if (layout.backgroundImageDataUrl) {
    imgDims = await loadImageDimensions(layout.backgroundImageDataUrl);
  }

  let serial = printOptions.serialStartNumber;

  for (let i = 0; i < numbers.length; i++) {
    const pageIndex = Math.floor(i / perPage);
    const indexOnPage = i % perPage;
    const col = indexOnPage % layout.columns;
    const row = Math.floor(indexOnPage / layout.columns);

    if (indexOnPage === 0 && pageIndex > 0) doc.addPage();

    const x = MARGIN_MM + col * (boxWidth + layout.boxSpacing);
    const y = MARGIN_MM + row * (boxHeight + layout.boxSpacing);

    if (layout.backgroundImageDataUrl && imgDims) {
      if (layout.backgroundFit === "stretch") {
        doc.addImage(layout.backgroundImageDataUrl, detectImageFormat(layout.backgroundImageDataUrl), x, y, boxWidth, boxHeight);
      } else {
        const imgRatio = imgDims.width / imgDims.height;
        const boxRatio = boxWidth / boxHeight;
        const scaleToBox =
          layout.backgroundFit === "contain"
            ? imgRatio > boxRatio
              ? boxWidth / imgDims.width
              : boxHeight / imgDims.height
            : imgRatio > boxRatio
              ? boxHeight / imgDims.height
              : boxWidth / imgDims.width;
        const drawWidth = imgDims.width * scaleToBox;
        const drawHeight = imgDims.height * scaleToBox;
        const offsetX = x + (boxWidth - drawWidth) / 2;
        const offsetY = y + (boxHeight - drawHeight) / 2;

        if (layout.backgroundFit === "cover") {
          // "cover" can overflow the card box, so clip to the box bounds first.
          doc.saveGraphicsState();
          doc.rect(x, y, boxWidth, boxHeight, null);
          doc.clip();
          doc.discardPath();
          doc.addImage(layout.backgroundImageDataUrl, detectImageFormat(layout.backgroundImageDataUrl), offsetX, offsetY, drawWidth, drawHeight);
          doc.restoreGraphicsState();
        } else {
          doc.addImage(layout.backgroundImageDataUrl, detectImageFormat(layout.backgroundImageDataUrl), offsetX, offsetY, drawWidth, drawHeight);
        }
      }
    }

    if (layout.useBorder) {
      doc.setLineWidth(layout.borderWidth * mmPerPx);
      doc.setDrawColor(layout.borderColor);
      doc.rect(x, y, boxWidth, boxHeight);
    }

    // baseline: "top" makes jsPDF's y-coordinate mean the TOP of the text,
    // matching how the CSS preview positions it (top-anchored). Without this,
    // jsPDF anchors to the text baseline, which sits lower than the box's
    // "top" — that's why the printed PDF looked higher/misaligned vs preview.
    doc.setFont(resolvePdfFont(layout.font || "helvetica"), layout.fontWeight === "bold" ? "bold" : "normal");
    doc.setTextColor(layout.textColor || "#000000");
    doc.setFontSize(layout.textSize);
    doc.text(numbers[i], x + layout.textPositionX * mmPerPx, y + layout.textPositionY * mmPerPx, {
      align: layout.textAlign === "right" ? "right" : layout.textAlign === "center" ? "center" : "left",
      angle: layout.textRotation || 0,
      baseline: "top",
    });

    if (printOptions.useSerialNumber) {
      doc.setFont(resolvePdfFont(layout.font || "helvetica"), "normal");
      doc.setTextColor(layout.serialColor || "#000000");
      doc.setFontSize(layout.serialNumberSize);
      doc.text(
        String(serial),
        x + layout.serialPositionX * mmPerPx,
        y + layout.serialPositionY * mmPerPx,
        { baseline: "top" }
      );
      serial++;
    }

    if (printOptions.useDatePrinting) {
      doc.setFont(resolvePdfFont(layout.font || "helvetica"), "normal");
      doc.setTextColor(layout.dateColor || "#000000");
      doc.setFontSize(layout.dateSize);
      doc.text(today, x + layout.datePositionX * mmPerPx, y + layout.datePositionY * mmPerPx, {
        baseline: "top",
      });
    }

    if (printOptions.useCustomText && printOptions.customText) {
      doc.setFont(resolvePdfFont(layout.font || "helvetica"), "normal");
      doc.setTextColor(layout.customTextColor || "#000000");
      doc.setFontSize(layout.customTextSize);
      doc.text(
        printOptions.customText,
        x + layout.customTextPositionX * mmPerPx,
        y + layout.customTextPositionY * mmPerPx,
        { baseline: "top" }
      );
    }
  }

  return doc.output("blob");
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export { triggerDownload };
