/**
 * 全局事件管理器
 * 用于跨组件通信
 */

// 素材更新事件
export const ASSETS_CHANGED_EVENT = 'assets-changed';

export interface AssetsChangedEvent {
  projectId: string;
  type: 'upload' | 'delete' | 'update' | 'reorder';
  assetId?: string;
}

// 触发素材更新事件
export function emitAssetsChanged(projectId: string, type: AssetsChangedEvent['type'], assetId?: string) {
  if (typeof window !== 'undefined') {
    const event = new CustomEvent<AssetsChangedEvent>(ASSETS_CHANGED_EVENT, {
      detail: { projectId, type, assetId }
    });
    window.dispatchEvent(event);
  }
}

// 监听素材更新事件
export function onAssetsChanged(callback: (event: AssetsChangedEvent) => void) {
  if (typeof window !== 'undefined') {
    const handler = (e: CustomEvent<AssetsChangedEvent>) => callback(e.detail);
    window.addEventListener(ASSETS_CHANGED_EVENT, handler as EventListener);
    return () => window.removeEventListener(ASSETS_CHANGED_EVENT, handler as EventListener);
  }
  return () => {};
}
