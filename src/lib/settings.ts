"use client";

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface TosSettings {
  endpoint: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
}

export interface AppSettings {
  // API 设置
  arkApiKey: string;
  modelId: string;
  
  // 主题设置
  theme: 'light' | 'dark' | 'system';
  
  // TOS 存储设置
  tosSettings: TosSettings;
  tosEnabled: boolean;
  
  // Actions
  setArkApiKey: (key: string) => void;
  setModelId: (id: string) => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  setTosSettings: (settings: TosSettings) => void;
  setTosEnabled: (enabled: boolean) => void;
}

export const useSettingsStore = create<AppSettings>()(
  persist(
    (set) => ({
      arkApiKey: '',
      modelId: '',
      theme: 'system',
      
      // TOS 配置默认值
      tosSettings: {
        endpoint: '',
        accessKey: '',
        secretKey: '',
        bucket: '',
      },
      tosEnabled: false,
      
      setArkApiKey: (key) => set({ arkApiKey: key }),
      setModelId: (id) => set({ modelId: id }),
      setTheme: (theme) => set({ theme }),
      setTosSettings: (settings) => set({ tosSettings: settings }),
      setTosEnabled: (enabled) => set({ tosEnabled: enabled }),
    }),
    {
      name: 'seedance-settings',
    }
  )
);
