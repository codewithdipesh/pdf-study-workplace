"use client";

import { create } from "zustand";

export type ReaderTool = "pen" | "highlighter" | "eraser";

type ReaderState = {
  currentPage: number;
  zoom: number;
  fitMode: "page" | "width" | "manual";
  tool: ReaderTool;
  showSidebar: boolean;
  showNotes: boolean;
  showBookmarks: boolean;
  setCurrentPage: (page: number) => void;
  setZoom: (zoom: number) => void;
  setFitMode: (fitMode: ReaderState["fitMode"]) => void;
  setTool: (tool: ReaderTool) => void;
  toggleSidebar: () => void;
  toggleNotes: () => void;
  toggleBookmarks: () => void;
};

const useReaderStoreBase = create<ReaderState>((set) => ({
  currentPage: 1,
  zoom: 1,
  fitMode: "width",
  tool: "pen",
  showSidebar: true,
  showNotes: true,
  showBookmarks: true,
  setCurrentPage: (currentPage) => set({ currentPage }),
  setZoom: (zoom) => set({ zoom, fitMode: "manual" }),
  setFitMode: (fitMode) => set({ fitMode }),
  setTool: (tool) => set({ tool }),
  toggleSidebar: () => set((state) => ({ showSidebar: !state.showSidebar })),
  toggleNotes: () => set((state) => ({ showNotes: !state.showNotes })),
  toggleBookmarks: () => set((state) => ({ showBookmarks: !state.showBookmarks })),
}));

// Memoized selectors to avoid infinite loops
export const useReaderStore = useReaderStoreBase;
export const useReaderTool = () => useReaderStoreBase((state) => state.tool);
export const useSetReaderTool = () => useReaderStoreBase((state) => state.setTool);
