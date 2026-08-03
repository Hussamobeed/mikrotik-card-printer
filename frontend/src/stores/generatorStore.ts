import { create } from "zustand";
import { persist } from "zustand/middleware";
import { GeneratorSettings, PdfLayoutSettings, PrintOptions } from "@/types";

interface GeneratorState {
  settings: GeneratorSettings;
  printOptions: PrintOptions;
  layout: PdfLayoutSettings; // the currently ACTIVE template's styling (read-only from the Generator page — only Templates page edits/saves layouts)
  activeTemplateId: string | null;
  numbers: string[];
  script: string;
  history: { numbers: string[]; script: string }[];
  historyIndex: number;
  zoom: number;
  gridEnabled: boolean;
  snapToGrid: boolean;
  gridSize: number;
  setSettings: (partial: Partial<GeneratorSettings>) => void;
  setPrintOptions: (partial: Partial<PrintOptions>) => void;
  applyTemplate: (templateId: string | null, layout: PdfLayoutSettings) => void;
  setResult: (numbers: string[], script: string) => void;
  undo: () => void;
  redo: () => void;
  setZoom: (zoom: number) => void;
  toggleGrid: () => void;
  toggleSnap: () => void;
  setGridSize: (size: number) => void;
}

const defaultSettings: GeneratorSettings = {
  beginNumber: "1",
  numLength: 8,
  numCount: 720,
  customer: "Salam",
  comment: "",
  profile: "",
  passwordType: "same",
};

const defaultPrintOptions: PrintOptions = {
  useSerialNumber: false,
  serialStartNumber: 1,
  useDatePrinting: false,
  useCustomText: false,
  customText: "",
};

export const defaultLayout: PdfLayoutSettings = {
  backgroundImageDataUrl: null,
  backgroundFit: "contain",
  useBorder: true,
  borderWidth: 2,
  borderColor: "#000000",
  columns: 4,
  rows: 18,
  boxSpacing: 1,

  textSize: 8,
  textPositionX: 67,
  textPositionY: 26,
  font: "Cairo",
  fontWeight: "normal",
  textColor: "#000000",
  textAlign: "left",
  textRotation: 0,

  serialNumberSize: 5,
  serialPositionX: 150,
  serialPositionY: 47,
  serialColor: "#000000",

  dateSize: 8,
  datePositionX: 0,
  datePositionY: 20,
  dateColor: "#000000",

  customTextSize: 8,
  customTextPositionX: 10,
  customTextPositionY: 60,
  customTextColor: "#000000",
};

export const useGeneratorStore = create<GeneratorState>()(
  persist(
    (set, get) => ({
      settings: defaultSettings,
      printOptions: defaultPrintOptions,
      layout: defaultLayout,
      activeTemplateId: null,
      numbers: [],
      script: "",
      history: [],
      historyIndex: -1,
      zoom: 1,
      gridEnabled: false,
      snapToGrid: false,
      gridSize: 10,

      setSettings: (partial) => set((s) => ({ settings: { ...s.settings, ...partial } })),
      setPrintOptions: (partial) => set((s) => ({ printOptions: { ...s.printOptions, ...partial } })),
      applyTemplate: (templateId, layout) => set({ activeTemplateId: templateId, layout }),
      setZoom: (zoom) => set({ zoom: Math.min(3, Math.max(0.25, zoom)) }),
      toggleGrid: () => set((s) => ({ gridEnabled: !s.gridEnabled })),
      toggleSnap: () => set((s) => ({ snapToGrid: !s.snapToGrid })),
      setGridSize: (gridSize) => set({ gridSize }),

      setResult: (numbers, script) => {
        const { history, historyIndex } = get();
        const truncated = history.slice(0, historyIndex + 1);
        const nextHistory = [...truncated, { numbers, script }].slice(-50); // unlimited-ish, capped for memory safety
        set({
          numbers,
          script,
          history: nextHistory,
          historyIndex: nextHistory.length - 1,
        });
      },

      undo: () => {
        const { history, historyIndex } = get();
        if (historyIndex <= 0) return;
        const prev = history[historyIndex - 1];
        set({ numbers: prev.numbers, script: prev.script, historyIndex: historyIndex - 1 });
      },

      redo: () => {
        const { history, historyIndex } = get();
        if (historyIndex >= history.length - 1) return;
        const next = history[historyIndex + 1];
        set({ numbers: next.numbers, script: next.script, historyIndex: historyIndex + 1 });
      },
    }),
    {
      name: "obaid-manager-generator-settings",
      partialize: (s) => ({
        settings: s.settings,
        printOptions: s.printOptions,
        layout: s.layout,
        activeTemplateId: s.activeTemplateId,
        zoom: s.zoom,
        gridEnabled: s.gridEnabled,
        snapToGrid: s.snapToGrid,
        gridSize: s.gridSize,
      }),
    }
  )
);
