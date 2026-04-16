"use client";

import { useCallback, useRef, useEffect } from "react";

// 拖拽放置区域 hook - 使用原生 HTML5 拖拽 API
interface UseDropZoneOptions {
  onDrop?: (data: unknown) => void;
  onDragEnter?: () => void;
  onDragLeave?: () => void;
  dataType?: string;
}

export function useDropZone({
  onDrop,
  onDragEnter,
  onDragLeave,
  dataType = "application/json",
}: UseDropZoneOptions = {}) {
  // 使用 ref 存储最新的回调函数，避免闭包问题
  const callbacksRef = useRef({ onDrop, onDragEnter, onDragLeave });
  const dragCounterRef = useRef(0);

  // 更新回调引用
  useEffect(() => {
    callbacksRef.current = { onDrop, onDragEnter, onDragLeave };
  }, [onDrop, onDragEnter, onDragLeave]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // 检查是否包含我们需要的数据类型
    const hasValidData =
      e.dataTransfer.types.includes(dataType) ||
      e.dataTransfer.types.includes("text/plain");
    if (!hasValidData) return;

    dragCounterRef.current++;
    if (dragCounterRef.current === 1) {
      callbacksRef.current.onDragEnter?.();
    }
  }, [dataType]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    dragCounterRef.current--;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      callbacksRef.current.onDragLeave?.();
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    dragCounterRef.current = 0;
    callbacksRef.current.onDragLeave?.();

    try {
      // 尝试获取指定类型的数据
      let jsonData = e.dataTransfer.getData(dataType);

      // 如果没有，尝试获取 text/plain
      if (!jsonData) {
        jsonData = e.dataTransfer.getData("text/plain");
      }

      if (jsonData) {
        const data = JSON.parse(jsonData);
        callbacksRef.current.onDrop?.(data);
      }
    } catch (err) {
      console.error("Failed to parse drop data:", err);
    }
  }, [dataType]);

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
  onDragEnded?: () => void;
  dataType?: string;
}

export function useDraggable({
  data,
  onDragStarted,
  onDragEnded,
  dataType = "application/json",
}: UseDraggableOptions) {
  // 使用 ref 存储最新的回调函数
  const callbacksRef = useRef({ onDragStarted, onDragEnded });
  
  useEffect(() => {
    callbacksRef.current = { onDragStarted, onDragEnded };
  }, [onDragStarted, onDragEnded]);

  const handleDragStart = useCallback((e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData(dataType, JSON.stringify(data));
    // 同时设置 text/plain 作为备用
    e.dataTransfer.setData("text/plain", JSON.stringify(data));
    callbacksRef.current.onDragStarted?.();
  }, [data, dataType]);

  const handleDragEnd = useCallback(() => {
    callbacksRef.current.onDragEnded?.();
  }, []);

  return {
    draggableProps: {
      draggable: true,
      onDragStart: handleDragStart,
      onDragEnd: handleDragEnd,
    },
  };
}
