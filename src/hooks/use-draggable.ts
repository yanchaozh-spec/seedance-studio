"use client";

import { useCallback, useRef } from "react";

// 拖拽放置区域 hook - 使用原生 HTML5 拖拽 API
interface UseDropZoneOptions {
  onDrop?: (data: unknown) => void;
  onDragEnter?: () => void;
  onDragLeave?: () => void;
  // 数据类型标识，用于校验
  dataType?: string;
}

export function useDropZone({ 
  onDrop, 
  onDragEnter, 
  onDragLeave,
  dataType = "application/json" 
}: UseDropZoneOptions = {}) {
  const dragCounter = useRef(0);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (dragCounter.current === 1) {
      onDragEnter?.();
    }
  }, [onDragEnter]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      onDragLeave?.();
    }
  }, [onDragLeave]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    onDragLeave?.();
    
    try {
      const jsonData = e.dataTransfer.getData(dataType);
      if (jsonData) {
        const data = JSON.parse(jsonData);
        onDrop?.(data);
      }
    } catch (err) {
      console.error("Failed to parse drop data:", err);
    }
  }, [dataType, onDrop, onDragLeave]);

  return {
    dropZoneProps: {
      onDragEnter: handleDragEnter,
      onDragOver: handleDragOver,
      onDragLeave: handleDragLeave,
      onDrop: handleDrop,
    },
  };
}

// 拖拽源 hook - 设置拖拽数据
interface UseDraggableOptions {
  data: unknown;
  onDragStarted?: () => void;
  dataType?: string;
}

export function useDraggable({ 
  data, 
  onDragStarted,
  dataType = "application/json" 
}: UseDraggableOptions) {
  const handleDragStart = useCallback((e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData(dataType, JSON.stringify(data));
    // 同时设置 text/plain 作为备用
    e.dataTransfer.setData("text/plain", JSON.stringify(data));
    onDragStarted?.();
  }, [data, dataType, onDragStarted]);

  return {
    draggable: true,
    onDragStart: handleDragStart,
  };
}
