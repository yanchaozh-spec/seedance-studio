"use client";

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AppSettings {
  // API 设置
  arkApiKey: string;
  
  // 模型设置
  modelMode: 'fast' | 'standard'; // fast 模式 vs 标准 2.0 模式
  
  // 主题设置
  theme: 'light' | 'dark' | 'system';
  
  // Actions
  setArkApiKey: (key: string) => void;
  setModelMode: (mode: 'fast' | 'standard') => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
}

export const useSettingsStore = create<AppSettings>()(
  persist(
    (set) => ({
      arkApiKey: process.env.NEXT_PUBLIC_ARK_API_KEY || '',
      modelMode: 'standard',
      theme: 'system',
      
      setArkApiKey: (key) => set({ arkApiKey: key }),
      setModelMode: (mode) => set({ modelMode: mode }),
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: 'seedance-settings',
    }
  )
);
