"use client";

import { useState, useRef, useCallback, useEffect, forwardRef, useMemo } from "react";
import { cn } from "@/lib/utils";

interface MentionItem {
  id: string;
  name: string;
  type: string;
  thumbnail_url?: string;
}

interface PromptTextareaProps {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  className?: string;
  mentionItems: MentionItem[];
}

/**
 * 将文本按 @mention 分割为高亮片段
 * 匹配 @素材名 的模式（素材名来自 mentionItems）
 */
function parseMentionSegments(
  text: string,
  mentionNames: string[]
): Array<{ text: string; isMention: boolean; mentionName?: string }> {
  if (mentionNames.length === 0 || !text) {
    return [{ text, isMention: false }];
  }

  // 按名字长度降序构建正则，避免短名误匹配
  const sortedNames = [...mentionNames].sort((a, b) => b.length - a.length);
  const escapedNames = sortedNames.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`@(${escapedNames.join("|")})`, "g");

  const segments: Array<{ text: string; isMention: boolean; mentionName?: string }> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  // 重置 lastIndex
  pattern.lastIndex = 0;
  while ((match = pattern.exec(text)) !== null) {
    // match 之前的普通文本
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index), isMention: false });
    }
    // @mention 文本
    const mentionName = match[1];
    segments.push({ text: match[0], isMention: true, mentionName });
    lastIndex = match.index + match[0].length;
  }

  // 剩余文本
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), isMention: false });
  }

  return segments;
}

/**
 * 带素材 @提及 的提示词输入框
 * - 输入 @ 时弹出已激活素材列表，选中后插入 @角色名
 * - @角色名 高亮显示 + 缩略图徽章
 *
 * 镜像层原理：
 * - 底层 div 渲染高亮文本（textarea 文字透明）
 * - 两层共享完全相同的字体、行高、内边距
 * - 高亮 span 的文本内容与 textarea 完全一致（保证字符宽度对齐）
 *
 * 缩略图定位技巧：
 * - 给高亮 span 加 pl-[22px]（左内边距），为缩略图腾出空间
 * - 同时加 -ml-[22px]（负左外边距），抵消内边距导致的偏移
 * - 这样文字位置不变（与 textarea 对齐），但缩略图在 padding 区域内
 * - 缩略图使用 absolute 定位在 padding 区域，被高亮背景覆盖
 */
export const PromptTextarea = forwardRef<HTMLTextAreaElement, PromptTextareaProps>(
  function PromptTextarea(
    { value, onChange, onKeyDown, placeholder, className, mentionItems },
    forwardedRef
  ) {
    const [mentionOpen, setMentionOpen] = useState(false);
    const [mentionSearch, setMentionSearch] = useState("");
    const [mentionStartIndex, setMentionStartIndex] = useState(-1);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const internalRef = useRef<HTMLTextAreaElement>(null);
    const mirrorRef = useRef<HTMLDivElement>(null);

    // 合并 ref：内部使用 + 外部转发
    const mergedRef = useCallback(
      (el: HTMLTextAreaElement | null) => {
        (internalRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = el;
        if (typeof forwardedRef === "function") {
          forwardedRef(el);
        } else if (forwardedRef) {
          (forwardedRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = el;
        }
      },
      [forwardedRef]
    );

    // 构建 mentionName → item 映射
    const mentionMap = useMemo(() => {
      const map = new Map<string, MentionItem>();
      for (const item of mentionItems) {
        map.set(item.name, item);
      }
      return map;
    }, [mentionItems]);

    const mentionNames = useMemo(
      () => mentionItems.map((i) => i.name),
      [mentionItems]
    );

    // 过滤匹配的素材
    const filteredItems = mentionItems.filter((item) => {
      const search = mentionSearch.toLowerCase();
      return item.name.toLowerCase().includes(search);
    });

    // 检测 @提及 触发
    const checkMention = useCallback(
      (text: string, cursorPos: number) => {
        const textBeforeCursor = text.slice(0, cursorPos);
        const atMatch = textBeforeCursor.match(/@([^@\s\n]*)$/);
        if (atMatch) {
          setMentionOpen(true);
          setMentionSearch(atMatch[1]);
          setMentionStartIndex(cursorPos - atMatch[0].length);
          setSelectedIndex(0);
        } else {
          setMentionOpen(false);
        }
      },
      []
    );

    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newValue = e.target.value;
        onChange(newValue);
        requestAnimationFrame(() => {
          const cursorPos = e.target.selectionStart;
          if (cursorPos !== null) {
            checkMention(newValue, cursorPos);
          }
        });
      },
      [onChange, checkMention]
    );

    const insertMention = useCallback(
      (itemName: string) => {
        const textarea = internalRef.current;
        if (!textarea || mentionStartIndex < 0) return;

        const before = value.slice(0, mentionStartIndex);
        const after = value.slice(textarea.selectionStart);
        const newValue = before + `@${itemName}` + after;

        onChange(newValue);
        setMentionOpen(false);
        setMentionSearch("");
        setMentionStartIndex(-1);

        requestAnimationFrame(() => {
          const newCursorPos = before.length + itemName.length + 1;
          textarea.focus();
          textarea.setSelectionRange(newCursorPos, newCursorPos);
        });
      },
      [value, onChange, mentionStartIndex]
    );

    // 键盘导航
    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (mentionOpen && filteredItems.length > 0) {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setSelectedIndex((prev) =>
              prev < filteredItems.length - 1 ? prev + 1 : 0
            );
            return;
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setSelectedIndex((prev) =>
              prev > 0 ? prev - 1 : filteredItems.length - 1
            );
            return;
          }
          if (e.key === "Enter" || e.key === "Tab") {
            e.preventDefault();
            const selected = filteredItems[selectedIndex];
            if (selected) {
              insertMention(selected.name);
            }
            return;
          }
          if (e.key === "Escape") {
            e.preventDefault();
            setMentionOpen(false);
            return;
          }
        }
        onKeyDown?.(e);
      },
      [mentionOpen, filteredItems, selectedIndex, insertMention, onKeyDown]
    );

    // 点击外部关闭
    useEffect(() => {
      if (!mentionOpen) return;
      const handleClickOutside = () => setMentionOpen(false);
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }, [mentionOpen]);

    // 同步滚动到镜像层
    const handleScroll = useCallback(() => {
      const textarea = internalRef.current;
      const mirror = mirrorRef.current;
      if (textarea && mirror) {
        mirror.scrollTop = textarea.scrollTop;
        mirror.scrollLeft = textarea.scrollLeft;
      }
    }, []);

    // 解析高亮片段
    const segments = useMemo(
      () => parseMentionSegments(value, mentionNames),
      [value, mentionNames]
    );

    // 共享的文本样式，确保 textarea 和 mirror 完全对齐
    const sharedTextStyle = "text-sm leading-[1.625rem] px-3 py-2 font-inherit";

    return (
      <div className="relative flex-1 min-w-0">
        {/* 高亮镜像层：渲染带样式的文本 */}
        <div
          ref={mirrorRef}
          className={cn(
            "absolute inset-0 overflow-hidden whitespace-pre-wrap break-words pointer-events-none",
            sharedTextStyle,
            className
          )}
          aria-hidden="true"
        >
          {value ? (
            segments.map((seg, i) => {
              if (seg.isMention && seg.mentionName) {
                const item = mentionMap.get(seg.mentionName);
                return (
                  <span
                    key={i}
                    className={cn(
                      /*
                       * pl-[22px] -ml-[22px] 技巧：
                       * pl-[22px]: 在 span 左侧腾出 22px 空间放缩略图
                       * -ml-[22px]: 负 margin 抵消 padding 导致的偏移
                       * 效果：文字位置不变（与 textarea 对齐），但缩略图在 padding 区域内
                       * 高亮背景覆盖 padding + content，所以缩略图在高亮框内
                       */
                      "relative inline-block pl-[22px] -ml-[22px] rounded-sm font-medium",
                      item?.type === "audio"
                        ? "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300"
                        : "bg-primary/10 text-primary"
                    )}
                  >
                    {seg.text}
                    {/* 缩略图在 padding 区域内，被高亮背景覆盖 */}
                    {item?.thumbnail_url ? (
                      <img
                        src={item.thumbnail_url}
                        alt=""
                        className="absolute left-[3px] top-1/2 -translate-y-1/2 w-4 h-4 rounded-sm object-cover pointer-events-none ring-1 ring-background/80"
                      />
                    ) : item ? (
                      <span
                        className={cn(
                          "absolute left-[3px] top-1/2 -translate-y-1/2 w-4 h-4 rounded-sm flex items-center justify-center pointer-events-none",
                          item.type === "audio"
                            ? "bg-violet-200 dark:bg-violet-800/50 text-violet-600 dark:text-violet-300"
                            : "bg-primary/20 text-primary"
                        )}
                        style={{ fontSize: 9, lineHeight: 1 }}
                      >
                        {item.type === "audio" ? "♪" : "🖼"}
                      </span>
                    ) : null}
                  </span>
                );
              }
              return <span key={i}>{seg.text}</span>;
            })
          ) : (
            // placeholder
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          {/* 末尾换行占位，确保高度对齐 */}
          <span className="select-none">{"\n"}</span>
        </div>

        {/* 实际输入层：文字透明，光标可见 */}
        <textarea
          ref={mergedRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onScroll={handleScroll}
          className={cn(
            "relative z-10 bg-transparent caret-foreground",
            // 文字颜色透明，由镜像层渲染
            "text-transparent",
            // 保持边框和聚焦样式（与 Textarea 组件一致）
            "border-input placeholder:text-muted-foreground",
            "focus-visible:border-ring focus-visible:ring-ring/50",
            "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
            "dark:bg-input/30",
            "rounded-md border shadow-xs transition-[color,box-shadow] outline-none",
            "focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
            "w-full flex field-sizing-content",
            sharedTextStyle,
            className
          )}
        />

        {/* @提及下拉列表 */}
        {mentionOpen && filteredItems.length > 0 && (
          <div
            className="absolute z-50 left-0 bottom-full mb-1 w-56 max-h-48 overflow-y-auto rounded-md border bg-popover p-1 shadow-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-2 py-1 text-xs text-muted-foreground">
              选择素材（↑↓ 选择，Enter/Tab 确认，Esc 关闭）
            </div>
            {filteredItems.map((item, index) => (
              <button
                key={item.id}
                type="button"
                className={cn(
                  "flex items-center gap-2 w-full rounded-sm px-2 py-1.5 text-sm text-left hover:bg-accent hover:text-accent-foreground transition-colors",
                  index === selectedIndex ? "bg-accent text-accent-foreground" : ""
                )}
                onClick={() => insertMention(item.name)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                {item.thumbnail_url && (
                  <img
                    src={item.thumbnail_url}
                    alt={item.name}
                    className="w-6 h-6 rounded object-cover flex-shrink-0"
                  />
                )}
                {!item.thumbnail_url && (
                  <div className="w-6 h-6 rounded bg-muted flex items-center justify-center flex-shrink-0 text-xs">
                    {item.type === "audio" ? "♪" : "🖼"}
                  </div>
                )}
                <span className="truncate">{item.name}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {item.type === "audio" ? "音频" : "图片"}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }
);
