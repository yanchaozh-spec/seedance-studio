"use client";

import { create } from 'zustand';

interface DragState {
  isDragging: boolean;
  draggedAssetId: string | null;
  setDragging: (isDragging: boolean, assetId?: string) => void;
}

export const useDragStore = create<DragState>((set) => ({
  isDragging: false,
  draggedAssetId: null,
  setDragging: (isDragging, assetId) => 
    set({ 
      isDragging, 
      draggedAssetId: isDragging ? (assetId || null) : null 
    }),
}));
