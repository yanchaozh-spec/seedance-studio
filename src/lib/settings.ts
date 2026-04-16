"use client";

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// 默认接入点 ID
const DEFAULT_MODEL_ID = "ep-20260416124751-x4tfn";

export interface AppSettings {
  // API 设置
  arkApiKey: string;
  modelId: string;
  
  // 主题设置
  theme: 'light' | 'dark' | 'system';
  
  // Actions
  setArkApiKey: (key: string) => void;
  setModelId: (id: string) => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
}

export const useSettingsStore = create<AppSettings>()(
  persist(
    (set) => ({
      arkApiKey: process.env.NEXT_PUBLIC_ARK_API_KEY || '',
      modelId: DEFAULT_MODEL_ID,
      theme: 'system',
      
      setArkApiKey: (key) => set({ arkApiKey: key }),
      setModelId: (id) => set({ modelId: id }),
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: 'seedance-settings',
    }
  )
);
