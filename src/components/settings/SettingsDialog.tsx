"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sun, Moon, Settings, Cloud, Eye, EyeOff, CheckCircle } from "lucide-react";
import { useTheme } from "next-themes";
import { useSettingsStore, TosSettings } from "@/lib/settings";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const { 
    arkApiKey, setArkApiKey, 
    modelId, setModelId,
    tosSettings, setTosSettings,
    tosEnabled, setTosEnabled,
  } = useSettingsStore();
  const { theme, setTheme } = useTheme();
  
  // API 配置本地状态
  const [localApiKey, setLocalApiKey] = useState(arkApiKey);
  const [localModelId, setLocalModelId] = useState(modelId);
  const [saving, setSaving] = useState(false);
  
  // TOS 配置本地状态
  const [localTosSettings, setLocalTosSettings] = useState<TosSettings>(tosSettings);
  const [showSecretKey, setShowSecretKey] = useState(false);

  // 同步 store 到本地状态
  useEffect(() => { setLocalApiKey(arkApiKey); }, [arkApiKey]);
  useEffect(() => { setLocalModelId(modelId); }, [modelId]);
  useEffect(() => { setLocalTosSettings(tosSettings); }, [tosSettings]);

  const handleSave = () => {
    setArkApiKey(localApiKey);
    setModelId(localModelId);
    setTosSettings(localTosSettings);
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

  const handleTestTos = async () => {
    if (!localTosSettings.endpoint || !localTosSettings.accessKey || 
        !localTosSettings.secretKey || !localTosSettings.bucket) {
      toast.error("请填写完整的 TOS 配置");
      return;
    }
    
    try {
      const response = await fetch("/api/storage/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(localTosSettings),
      });
      const data = await response.json();
      if (data.success) {
        toast.success("TOS 连接成功！配置有效");
      } else {
        toast.error(data.error || "连接失败");
      }
    } catch {
      toast.error("TOS 连接测试失败");
    }
  };

  const updateTosSetting = (key: keyof TosSettings, value: string) => {
    setLocalTosSettings(prev => ({ ...prev, [key]: value }));
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
        
        <Tabs defaultValue="general" className="w-full">
          <TabsList className="w-full grid grid-cols-2">
            <TabsTrigger value="general">通用</TabsTrigger>
            <TabsTrigger value="storage">存储</TabsTrigger>
          </TabsList>
          
          {/* 通用设置 */}
          <TabsContent value="general" className="space-y-6 py-4">
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
                  placeholder="ep-xxxxxxxxxxxx"
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
          </TabsContent>
          
          {/* 存储设置 */}
          <TabsContent value="storage" className="space-y-4 py-4">
            {/* TOS 开关 */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cloud className="w-4 h-4" />
                <Label className="text-sm font-medium">启用 TOS 存储</Label>
              </div>
              <Switch 
                checked={tosEnabled}
                onCheckedChange={setTosEnabled}
              />
            </div>
            
            {tosEnabled && (
              <div className="space-y-4">
                <p className="text-xs text-muted-foreground">
                  配置火山云 TOS 存储，用于保存素材和视频。配置后将优先使用 TOS 存储。
                </p>
                
                {/* TOS 端点 */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">端点</Label>
                  <Input
                    placeholder="https://tos-cn-beijing.volces.com"
                    value={localTosSettings.endpoint}
                    onChange={(e) => updateTosSetting('endpoint', e.target.value)}
                    className="text-sm"
                  />
                </div>
                
                {/* Bucket 名称 */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">桶名称</Label>
                  <Input
                    placeholder="my-bucket"
                    value={localTosSettings.bucket}
                    onChange={(e) => updateTosSetting('bucket', e.target.value)}
                    className="text-sm"
                  />
                </div>
                
                {/* Access Key */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Access Key</Label>
                  <Input
                    placeholder="AKLT..."
                    value={localTosSettings.accessKey}
                    onChange={(e) => updateTosSetting('accessKey', e.target.value)}
                    className="text-sm"
                  />
                </div>
                
                {/* Secret Key */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Secret Key</Label>
                  <div className="flex gap-2">
                    <Input
                      type={showSecretKey ? "text" : "password"}
                      placeholder="VTJS..."
                      value={localTosSettings.secretKey}
                      onChange={(e) => updateTosSetting('secretKey', e.target.value)}
                      className="flex-1"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setShowSecretKey(!showSecretKey)}
                    >
                      {showSecretKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
                
                {/* 测试和保存按钮 */}
                <div className="flex gap-2">
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={handleTestTos}
                    className="flex-1"
                  >
                    测试连接
                  </Button>
                  <Button 
                    size="sm" 
                    onClick={handleSave}
                    disabled={saving}
                    className="flex-1"
                  >
                    {saving ? "已保存" : "保存"}
                  </Button>
                </div>
              </div>
            )}
            
            {!tosEnabled && (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Cloud className="w-12 h-12 text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">
                  关闭 TOS 后，将使用平台默认存储
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
