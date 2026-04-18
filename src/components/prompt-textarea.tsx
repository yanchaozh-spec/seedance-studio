"use client";

import { useState, useRef, useCallback, useEffect, forwardRef } from "react";
import { Textarea } from "@/components/ui/textarea";

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
 * 带素材 @提及 的提示词输入框
 * 输入 @ 时弹出已激活素材列表，选中后插入 @角色名
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

    // 过滤匹配的素材
    const filteredItems = mentionItems.filter((item) => {
      const search = mentionSearch.toLowerCase();
      return item.name.toLowerCase().includes(search);
    });

    // 检测 @提及 触发
    const checkMention = useCallback(
      (text: string, cursorPos: number) => {
        const textBeforeCursor = text.slice(0, cursorPos);
        // 匹配 @ 符号及其后的文字（不含空格和换行）
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
        // 延迟检测，确保 value 已更新
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

        // 设置光标位置到插入文本之后
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

    return (
      <div className="relative">
        <Textarea
          ref={mergedRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={className}
        />
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
                className={`flex items-center gap-2 w-full rounded-sm px-2 py-1.5 text-sm text-left hover:bg-accent hover:text-accent-foreground transition-colors ${
                  index === selectedIndex ? "bg-accent text-accent-foreground" : ""
                }`}
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
