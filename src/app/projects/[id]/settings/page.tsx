"use client";

import { useParams, useRouter } from "next/navigation";
import { useSettingsStore } from "@/lib/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTheme } from "next-themes";
import { ArrowLeft, Sun, Moon, Zap, Settings2, Key, Sparkles } from "lucide-react";
import { useState } from "react";

export default function SettingsPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  
  const { arkApiKey, modelMode, setArkApiKey, setModelMode } = useSettingsStore();
  const { theme, setTheme } = useTheme();
  
  const [localApiKey, setLocalApiKey] = useState(arkApiKey);
  const [saving, setSaving] = useState(false);
  
  const handleSaveApiKey = () => {
    setArkApiKey(localApiKey);
    // Show a brief success indicator
    setSaving(true);
    setTimeout(() => setSaving(false), 1500);
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* 返回按钮 */}
      <Button
        variant="ghost"
        className="mb-6 gap-2"
        onClick={() => router.push(`/projects/${projectId}`)}
      >
        <ArrowLeft className="w-4 h-4" />
        返回视频生成
      </Button>

      <h1 className="text-2xl font-semibold mb-6 flex items-center gap-2">
        <Settings2 className="w-6 h-6" />
        设置
      </h1>

      <div className="space-y-6">
        {/* 主题设置 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {theme === "dark" ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
              外观设置
            </CardTitle>
            <CardDescription>选择您喜欢的主题模式</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3">
              <Button
                variant={theme === "light" ? "default" : "outline"}
                className="flex-1 gap-2"
                onClick={() => setTheme("light")}
              >
                <Sun className="w-4 h-4" />
                浅色模式
              </Button>
              <Button
                variant={theme === "dark" ? "default" : "outline"}
                className="flex-1 gap-2"
                onClick={() => setTheme("dark")}
              >
                <Moon className="w-4 h-4" />
                深色模式
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 模型设置 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5" />
              模型设置
            </CardTitle>
            <CardDescription>选择 Seedance 2.0 的运行模式</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="model-mode">运行模式</Label>
              <Select
                value={modelMode}
                onValueChange={(value) => setModelMode(value as "fast" | "standard")}
              >
                <SelectTrigger id="model-mode">
                  <SelectValue placeholder="选择模式" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4" />
                      <span>Seedance 2.0 标准模式</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="fast">
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4" />
                      <span>Seedance 2.0 Fast 模式</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="bg-muted/50 rounded-lg p-4 text-sm space-y-2">
              <div className="font-medium">模式说明：</div>
              <div className="space-y-1 text-muted-foreground">
                <div>
                  <span className="font-medium text-foreground">标准模式</span>：完整生成流程，画质更优，生成时间较长
                </div>
                <div>
                  <span className="font-medium text-foreground">Fast 模式</span>：快速生成，优先速度，适合快速预览
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* API Key 设置 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="w-5 h-5" />
              API 配置
            </CardTitle>
            <CardDescription>配置您的 ARK API Key（用于调用 Seedance 2.0）</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="api-key">ARK API Key</Label>
              <div className="flex gap-2">
                <Input
                  id="api-key"
                  type="password"
                  placeholder="请输入您的 ARK API Key"
                  value={localApiKey}
                  onChange={(e) => setLocalApiKey(e.target.value)}
                  className="flex-1"
                />
                <Button onClick={handleSaveApiKey} disabled={saving}>
                  {saving ? "已保存" : "保存"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                API Key 将安全保存在浏览器本地。如需获取，请访问火山引擎控制台。
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
