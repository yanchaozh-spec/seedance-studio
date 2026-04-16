"use client";

import { useState, useCallback, useRef, useEffect } from "react";

interface DraggableOptions {
  id: string;
  data?: unknown;
}

interface Position {
  x: number;
  y: number;
}

interface UseDraggableReturn {
  setNodeRef: (node: HTMLElement | null) => void;
  transform: Position | null;
  isDragging: boolean;
  listeners: {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
  };
  attributes: Record<string, unknown>;
}

export function useDraggable({ id, data }: DraggableOptions): UseDraggableReturn {
  const [isDragging, setIsDragging] = useState(false);
  const [transform, setTransform] = useState<Position | null>(null);
  const nodeRef = useRef<HTMLElement | null>(null);
  const startPos = useRef<Position>({ x: 0, y: 0 });
  const currentPos = useRef<Position>({ x: 0, y: 0 });

  const setNodeRef = useCallback((node: HTMLElement | null) => {
    nodeRef.current = node;
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    setIsDragging(true);
    startPos.current = { x: e.clientX, y: e.clientY };
    currentPos.current = { x: 0, y: 0 };
    
    // 设置拖拽数据
    if (data) {
      e.dataTransfer.setData("application/json", JSON.stringify(data));
    }
    e.dataTransfer.effectAllowed = "move";
  }, [data]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging) return;
    
    const dx = e.clientX - startPos.current.x;
    const dy = e.clientY - startPos.current.y;
    currentPos.current = { x: dx, y: dy };
    setTransform({ x: dx, y: dy });
  }, [isDragging]);

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
    setTransform(null);
  }, []);

  // 触摸事件处理
  useEffect(() => {
    const node = nodeRef.current;
    if (!node) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        setIsDragging(true);
        startPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        currentPos.current = { x: 0, y: 0 };
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDragging || e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - startPos.current.x;
      const dy = e.touches[0].clientY - startPos.current.y;
      currentPos.current = { x: dx, y: dy };
      setTransform({ x: dx, y: dy });
    };

    const handleTouchEnd = () => {
      setIsDragging(false);
      setTransform(null);
    };

    node.addEventListener("touchstart", handleTouchStart, { passive: true });
    node.addEventListener("touchmove", handleTouchMove, { passive: true });
    node.addEventListener("touchend", handleTouchEnd);

    return () => {
      node.removeEventListener("touchstart", handleTouchStart);
      node.removeEventListener("touchmove", handleTouchMove);
      node.removeEventListener("touchend", handleTouchEnd);
    };
  }, [isDragging]);

  return {
    setNodeRef,
    transform,
    isDragging,
    listeners: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
    },
    attributes: {
      draggable: true,
      role: "button",
      "aria-label": `draggable-${id}`,
    },
  };
}

// 拖拽放置区域 hook
interface UseDropZoneOptions {
  onDrop?: (data: unknown) => void;
}

export function useDropZone({ onDrop }: UseDropZoneOptions = {}) {
  const [isOver, setIsOver] = useState(false);
  const dropRef = useRef<HTMLElement | null>(null);

  const setDropRef = useCallback((node: HTMLElement | null) => {
    dropRef.current = node;
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setIsOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsOver(false);
    
    try {
      const jsonData = e.dataTransfer.getData("application/json");
      if (jsonData) {
        const data = JSON.parse(jsonData);
        onDrop?.(data);
      }
    } catch (err) {
      console.error("Failed to parse drop data:", err);
    }
  }, [onDrop]);

  return {
    dropRef: setDropRef,
    isOver,
    dropZoneProps: {
      onDragOver: handleDragOver,
      onDragLeave: handleDragLeave,
      onDrop: handleDrop,
    },
  };
}
