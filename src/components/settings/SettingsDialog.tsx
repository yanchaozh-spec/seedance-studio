"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sun, Moon, Settings } from "lucide-react";
import { useTheme } from "next-themes";
import { useSettingsStore } from "@/lib/settings";
import { toast } from "sonner";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const { arkApiKey, setArkApiKey, modelId, setModelId } = useSettingsStore();
  const { theme, setTheme } = useTheme();
  const [localApiKey, setLocalApiKey] = useState(arkApiKey);
  const [localModelId, setLocalModelId] = useState(modelId);
  const [saving, setSaving] = useState(false);

  // 当 store 中的值变化时，同步到本地状态
  useEffect(() => {
    setLocalApiKey(arkApiKey);
  }, [arkApiKey]);

  useEffect(() => {
    setLocalModelId(modelId);
  }, [modelId]);

  const handleSave = () => {
    setArkApiKey(localApiKey);
    setModelId(localModelId);
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      toast.success("设置已保存");
    }, 1000);
  };

  const handleTestApiKey = async () => {
    if (!localApiKey.trim()) {
      toast.error("请输入 API Key");
      return;
    }
    try {
      const response = await fetch("/api/seedance/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: localApiKey }),
      });
      const data = await response.json();
      if (data.success) {
        toast.success("连接成功！API Key 有效");
      } else {
        toast.error(data.error || "连接失败");
      }
    } catch {
      toast.error("连接测试失败");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Settings className="w-5 h-5" />
            设置
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          {/* 主题设置 */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">外观</Label>
            <div className="flex gap-2">
              <Button
                variant={theme === "light" ? "default" : "outline"}
                size="sm"
                onClick={() => setTheme("light")}
                className="flex-1 gap-1.5"
              >
                <Sun className="w-4 h-4" />
                浅色
              </Button>
              <Button
                variant={theme === "dark" ? "default" : "outline"}
                size="sm"
                onClick={() => setTheme("dark")}
                className="flex-1 gap-1.5"
              >
                <Moon className="w-4 h-4" />
                深色
              </Button>
            </div>
          </div>

          {/* API 配置 */}
          <div className="space-y-4">
            <Label className="text-sm font-medium">API 配置</Label>
            
            {/* 接入点 ID */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">接入点 ID</Label>
              <Input
                placeholder="ep-20260416124751-x4tfn"
                value={localModelId}
                onChange={(e) => setLocalModelId(e.target.value)}
                className="text-sm"
              />
            </div>
            
            {/* API Key */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">API Key</Label>
              <div className="flex gap-2">
                <Input
                  type="password"
                  placeholder="ARK API Key"
                  value={localApiKey}
                  onChange={(e) => setLocalApiKey(e.target.value)}
                  className="flex-1"
                />
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={handleTestApiKey}
                >
                  测试
                </Button>
              </div>
            </div>
            
            {/* 保存按钮 */}
            <Button size="sm" onClick={handleSave} disabled={saving} className="w-full">
              {saving ? "已保存" : "保存设置"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
