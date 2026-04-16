"use client";

import { create } from 'zustand';

interface DragState {
  isDragging: boolean;
  draggedAssetId: string | null;
  isOverDropZone: boolean; // 是否在投放区域上方
  setDragging: (isDragging: boolean, assetId?: string) => void;
  setOverDropZone: (isOver: boolean) => void;
  reset: () => void;
}

export const useDragStore = create<DragState>((set, get) => ({
  isDragging: false,
  draggedAssetId: null,
  isOverDropZone: false,
  
  setDragging: (isDragging, assetId) => {
    // 只有在当前没有其他拖拽，或者正在开始的拖拽ID匹配时才更新
    const current = get();
    if (!isDragging) {
      // 重置时清空所有状态
      set({ 
        isDragging: false, 
        draggedAssetId: null,
        isOverDropZone: false 
      });
    } else if (assetId) {
      // 开始拖拽
      set({ 
        isDragging: true, 
        draggedAssetId: assetId 
      });
    }
  },
  
  setOverDropZone: (isOver) => {
    set({ isOverDropZone: isOver });
  },
  
  reset: () => {
    set({ 
      isDragging: false, 
      draggedAssetId: null,
      isOverDropZone: false 
    });
  },
}));

// Helper hook: 是否正在拖拽
export const useIsDragging = () => useDragStore((state) => state.isDragging);

// Helper hook: 是否在投放区域上方
export const useIsOverDropZone = () => useDragStore((state) => state.isOverDropZone);

// Helper hook: 是否显示拖拽提示（正在拖拽且在投放区域上方）
export const useShowDragHint = () => {
  const isDragging = useDragStore((state) => state.isDragging);
  const isOverDropZone = useDragStore((state) => state.isOverDropZone);
  return isDragging && isOverDropZone;
};
