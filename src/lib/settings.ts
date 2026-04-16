"use client";

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AppSettings {
  // API 设置
  arkApiKey: string;
  
  // 主题设置
  theme: 'light' | 'dark' | 'system';
  
  // Actions
  setArkApiKey: (key: string) => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
}

export const useSettingsStore = create<AppSettings>()(
  persist(
    (set) => ({
      arkApiKey: process.env.NEXT_PUBLIC_ARK_API_KEY || '',
      theme: 'system',
      
      setArkApiKey: (key) => set({ arkApiKey: key }),
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: 'seedance-settings',
    }
  )
);
