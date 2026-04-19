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
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  placeholder?: string;
  className?: string;
  mentionItems: MentionItem[];
}

/**
 * 将文本按 @mention 分割为片段
 */
function parseMentionSegments(
  text: string,
  mentionNames: string[]
): Array<{ text: string; isMention: boolean; mentionName?: string }> {
  if (mentionNames.length === 0 || !text) {
    return [{ text, isMention: false }];
  }

  const sortedNames = [...mentionNames].sort((a, b) => b.length - a.length);
  const escapedNames = sortedNames.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`@(${escapedNames.join("|")})`, "g");

  const segments: Array<{ text: string; isMention: boolean; mentionName?: string }> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  pattern.lastIndex = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index), isMention: false });
    }
    segments.push({ text: match[0], isMention: true, mentionName: match[1] });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), isMention: false });
  }

  return segments;
}

/**
 * 带素材 @提及 的提示词输入框
 *
 * 单层架构：contentEditable div
 * - 提及渲染为 <span contenteditable="false"> 原子节点，光标天然对齐
 * - 缩略图是真实 DOM 元素，不需要镜像层，不存在偏移问题
 * - 提及芯片整体删除（backspace 一次删整个 @name）
 */
export const PromptTextarea = forwardRef<HTMLDivElement, PromptTextareaProps>(
  function PromptTextarea(
    { value, onChange, onKeyDown, placeholder, className, mentionItems },
    forwardedRef
  ) {
    const [mentionOpen, setMentionOpen] = useState(false);
    const [mentionSearch, setMentionSearch] = useState("");
    const [mentionStartIndex, setMentionStartIndex] = useState(-1);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const editorRef = useRef<HTMLDivElement>(null);
    // 标记是否由内部操作触发 value 变更，避免重复渲染
    const isInternalChange = useRef(false);

    // 用 ref 保存最新的回调，避免 effect 因回调引用变化而重复触发
    const onKeyDownRef = useRef(onKeyDown);
    onKeyDownRef.current = onKeyDown;

    const mergedRef = useCallback(
      (el: HTMLDivElement | null) => {
        (editorRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
        if (typeof forwardedRef === "function") {
          forwardedRef(el);
        } else if (forwardedRef) {
          (forwardedRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
        }
      },
      [forwardedRef]
    );

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

    // 序列化 key：只有名字真正变化时才触发 effect
    const mentionNamesKey = mentionNames.join("\0");

    const filteredItems = mentionItems.filter((item) => {
      const search = mentionSearch.toLowerCase();
      return item.name.toLowerCase().includes(search);
    });

    // 从 contentEditable DOM 中提取纯文本
    const extractText = useCallback((el: HTMLElement): string => {
      let text = "";
      for (const node of Array.from(el.childNodes)) {
        if (node.nodeType === Node.TEXT_NODE) {
          text += node.textContent || "";
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          const element = node as HTMLElement;
          if (element.dataset.mention === "true") {
            text += `@${element.dataset.mentionName || ""}`;
          } else {
            text += extractText(element);
          }
        }
      }
      return text;
    }, []);

    // 获取光标在纯文本中的位置
    const getCursorOffset = useCallback((): number => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || !editorRef.current) return 0;
      const range = sel.getRangeAt(0);
      const preRange = document.createRange();
      preRange.selectNodeContents(editorRef.current);
      preRange.setEnd(range.startContainer, range.startOffset);
      // 简化：用 preRange 的文本内容长度
      const container = document.createElement("div");
      container.appendChild(preRange.cloneContents());
      const offset = extractText(container).length;
      return offset;
    }, [extractText]);

    // 将纯文本中的光标位置还原到 DOM
    const setCursorOffset = useCallback((offset: number) => {
      const el = editorRef.current;
      if (!el) return;

      const range = document.createRange();
      let currentOffset = 0;

      const walk = (node: Node): boolean => {
        if (node.nodeType === Node.TEXT_NODE) {
          const len = (node.textContent || "").length;
          if (currentOffset + len >= offset) {
            range.setStart(node, offset - currentOffset);
            range.collapse(true);
            return true;
          }
          currentOffset += len;
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          const element = node as HTMLElement;
          if (element.dataset.mention === "true") {
            const mentionLen = 1 + (element.dataset.mentionName || "").length;
            if (currentOffset + mentionLen > offset) {
              // 光标在这个 mention 内部，放到 mention 后面
              range.setStartAfter(element);
              range.collapse(true);
              return true;
            }
            currentOffset += mentionLen;
          } else {
            for (const child of Array.from(element.childNodes)) {
              if (walk(child)) return true;
            }
          }
        }
        return false;
      };

      if (!walk(el)) {
        // 放到末尾
        range.selectNodeContents(el);
        range.collapse(false);
      }

      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }, []);

    // 根据 value 渲染 DOM 内容
    const renderFromValue = useCallback(
      (text: string, restoreCursor = true) => {
        const el = editorRef.current;
        if (!el) return;

        const cursorOffset = restoreCursor ? getCursorOffset() : -1;
        const segments = parseMentionSegments(text, mentionNames);

        // 构建 DOM
        const fragment = document.createDocumentFragment();
        for (const seg of segments) {
          if (seg.isMention && seg.mentionName) {
            const item = mentionMap.get(seg.mentionName);
            const chip = document.createElement("span");
            chip.contentEditable = "false";
            chip.dataset.mention = "true";
            chip.dataset.mentionName = seg.mentionName;
            chip.className = cn(
              "inline-flex items-center gap-0.5 rounded-sm font-medium px-1 select-none",
              item?.type === "audio"
                ? "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 ring-1 ring-violet-200 dark:ring-violet-700/40"
                : item?.type === "video"
                  ? "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300 ring-1 ring-cyan-200 dark:ring-cyan-700/40"
                  : "bg-primary/20 text-primary ring-1 ring-primary/20"
            );

            // 缩略图
            if (item?.thumbnail_url) {
              const img = document.createElement("img");
              img.src = item.thumbnail_url;
              img.className = "w-4 h-4 rounded-sm object-cover ring-1 ring-background/80 shrink-0";
              img.draggable = false;
              chip.appendChild(img);
            } else if (item) {
              const icon = document.createElement("span");
              icon.className = cn(
                "w-4 h-4 rounded-sm flex items-center justify-center shrink-0",
                item.type === "audio"
                  ? "bg-violet-200 dark:bg-violet-800/50 text-violet-600 dark:text-violet-300"
                  : item.type === "video"
                    ? "bg-cyan-200 dark:bg-cyan-800/50 text-cyan-600 dark:text-cyan-300"
                    : "bg-primary/20 text-primary"
              );
              icon.style.fontSize = "9px";
              icon.style.lineHeight = "1";
              icon.textContent = item.type === "audio" ? "♪" : item.type === "video" ? "▶" : "🖼";
              chip.appendChild(icon);
            }

            // @名字
            chip.appendChild(document.createTextNode(`@${seg.mentionName}`));
            fragment.appendChild(chip);
          } else {
            fragment.appendChild(document.createTextNode(seg.text));
          }
        }

        el.innerHTML = "";
        el.appendChild(fragment);

        // 恢复光标
        if (restoreCursor && cursorOffset >= 0) {
          setCursorOffset(cursorOffset);
        }
      },
      [mentionNames, mentionMap, getCursorOffset, setCursorOffset]
    );

    // 用 ref 保持 renderFromValue 的最新引用，避免 effect 因回调引用变化而重复触发
    const renderFromValueRef = useRef(renderFromValue);
    renderFromValueRef.current = renderFromValue;

    // 当 value 从外部变更时，重新渲染 DOM
    // 注意：依赖仅用 value，通过 ref 读取最新 renderFromValue
    useEffect(() => {
      if (isInternalChange.current) {
        isInternalChange.current = false;
        return;
      }
      renderFromValueRef.current(value, false);
    }, [value]);

    // 首次渲染
    useEffect(() => {
      renderFromValueRef.current(value, false);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // mentionNames 真正变化时重新渲染（新增/删除素材时高亮可能变化）
    // 使用序列化 key 做依赖，避免数组引用变化导致误触发
    useEffect(() => {
      renderFromValueRef.current(value, true);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mentionNamesKey]);

    // 检测 @提及触发
    const checkMention = useCallback((text: string, cursorPos: number) => {
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
    }, []);

    // 处理输入
    const handleInput = useCallback(() => {
      const el = editorRef.current;
      if (!el) return;

      const text = extractText(el);
      isInternalChange.current = true;
      onChange(text);

      // 检测 @提及
      requestAnimationFrame(() => {
        const cursorPos = getCursorOffset();
        checkMention(text, cursorPos);
      });
    }, [extractText, onChange, getCursorOffset, checkMention]);

    // 插入提及
    const insertMention = useCallback(
      (itemName: string) => {
        const el = editorRef.current;
        if (!el || mentionStartIndex < 0) return;

        // 先提取当前文本
        const currentText = extractText(el);
        const before = currentText.slice(0, mentionStartIndex);
        const after = currentText.slice(mentionStartIndex + 1 + mentionSearch.length);
        const newText = before + `@${itemName}` + after;

        // 更新 value
        isInternalChange.current = true;
        onChange(newText);

        // 重新渲染 DOM
        renderFromValue(newText, false);

        // 将光标放到提及后面
        const cursorPos = before.length + 1 + itemName.length;
        requestAnimationFrame(() => {
          setCursorOffset(cursorPos);
        });

        setMentionOpen(false);
        setMentionSearch("");
        setMentionStartIndex(-1);
      },
      [extractText, mentionStartIndex, mentionSearch, onChange, renderFromValue, setCursorOffset]
    );

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLDivElement>) => {
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

        // Tab 键在 contentEditable 中必须始终阻止默认行为（浏览器默认会跳转焦点）
        if (e.key === "Tab" && !mentionOpen) {
          e.preventDefault();
          onKeyDownRef.current?.(e);
          return;
        }

        onKeyDownRef.current?.(e);
      },
      [mentionOpen, filteredItems, selectedIndex, insertMention]
    );

    useEffect(() => {
      if (!mentionOpen) return;
      const handleClickOutside = () => setMentionOpen(false);
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }, [mentionOpen]);

    // 粘贴时只保留纯文本
    const handlePaste = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
      e.preventDefault();
      const text = e.clipboardData.getData("text/plain");
      document.execCommand("insertText", false, text);
    }, []);

    return (
      <div className="relative flex-1 min-w-0">
        {/* 单层 contentEditable 编辑器 */}
        <div
          ref={mergedRef}
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          className={cn(
            "whitespace-pre-wrap break-words outline-none",
            "rounded-md border shadow-xs transition-[color,box-shadow]",
            "border-input focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
            "dark:bg-input/30",
            "text-sm leading-[1.625rem] px-3 py-2",
            "min-h-[2.5rem] field-sizing-content",
            "empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground empty:before:pointer-events-none",
            className
          )}
          data-placeholder={placeholder}
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
                    {item.type === "audio" ? "♪" : item.type === "video" ? "▶" : "🖼"}
                  </div>
                )}
                <span className="truncate">{item.name}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {item.type === "audio" ? "音频" : item.type === "video" ? "视频" : "图片"}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }
);
