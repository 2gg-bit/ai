"use client";

import { useState, useRef, useEffect } from "react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  hasImage?: boolean;
}

// 简单的 Markdown 渲染器
function MarkdownRenderer({ content }: { content: string }) {
  // 处理图片
  const imageRegex = /!\[(.*?)\]\((https?:\/\/[^)]+)\)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  while ((match = imageRegex.exec(content)) !== null) {
    // 添加图片前的文本
    if (match.index > lastIndex) {
      parts.push(
        <span key={lastIndex}>{content.slice(lastIndex, match.index)}</span>
      );
    }

    // 添加图片
    const alt = match[1];
    const url = match[2];
    parts.push(
      <img
        key={match.index}
        src={url}
        alt={alt}
        className="max-w-full h-auto rounded-lg my-2"
        style={{ maxHeight: "300px" }}
      />
    );

    lastIndex = match.index + match[0].length;
  }

  // 添加剩余文本
  if (lastIndex < content.length) {
    parts.push(<span key={lastIndex}>{content.slice(lastIndex)}</span>);
  }

  return <>{parts.length > 0 ? parts : content}</>;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 生成唯一ID
  const generateId = () => Math.random().toString(36).substring(2, 15);

  // 发送消息
  const sendMessage = async (showImage = false) => {
    if (!inputValue.trim() && !showImage) return;

    const userMessage: Message = {
      id: generateId(),
      role: "user",
      content: showImage ? "想看图片" : inputValue.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsStreaming(true);

    // 创建助手消息占位
    const assistantId = generateId();
    const assistantMessage: Message = {
      id: assistantId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, assistantMessage]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage.content,
          history: messages.slice(-10).map((m) => ({
            role: m.role,
            content: m.content,
          })),
          showImage,
        }),
      });

      if (!response.ok) throw new Error("请求失败");

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        let accumulatedContent = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              if (data === "[DONE]") continue;

              try {
                const parsed = JSON.parse(data);
                if (parsed.content) {
                  accumulatedContent += parsed.content;
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantId
                        ? { ...m, content: accumulatedContent }
                        : m
                    )
                  );
                }
              } catch {
                // 忽略解析错误
              }
            }
          }
        }
      }
    } catch (error) {
      console.error("Error:", error);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: "抱歉，发生了一些错误，请稍后再试。" }
            : m
        )
      );
    } finally {
      setIsStreaming(false);
      inputRef.current?.focus();
    }
  };

  // 处理键盘事件
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#FAF8F5]">
      {/* 头部 */}
      <header className="flex items-center justify-center px-6 py-6 border-b border-[#E8D5C4] bg-white/50 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#E8D5C4] to-[#B8860B] flex items-center justify-center">
            <span className="text-white text-xl">👤</span>
          </div>
          <div className="flex flex-col">
            <h1 className="text-xl font-semibold text-[#2C241B]">
              司书晗的数字分身
            </h1>
            <p className="text-sm text-[#8B7355]">
              Agent开发工程师求职者 | 武汉理工大学计算机技术硕士
            </p>
          </div>
        </div>
      </header>

      {/* 消息区域 */}
      <main className="flex-1 overflow-y-auto px-4 py-6 md:px-8">
        <div className="max-w-[800px] mx-auto space-y-6">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-20 h-20 rounded-full bg-[#E8D5C4] flex items-center justify-center mb-4">
                <span className="text-3xl">💼</span>
              </div>
              <h2 className="text-2xl font-semibold text-[#2C241B] mb-2">
                你好，我是司书晗的AI数字分身
              </h2>
              <p className="text-[#8B7355] max-w-md mb-4">
                我目前是武汉理工大学计算机技术专业的28届毕业生，主要方向是 Agent 开发和计算机视觉。
                您可以随意问我关于我的项目经验、技术栈，或者我的爱好。
              </p>
              <div className="flex gap-2 flex-wrap justify-center">
                <button
                  onClick={() => {
                    setInputValue("你都了解哪些agent技术栈");
                  }}
                  className="px-4 py-2 bg-[#E8D5C4] text-[#2C241B] rounded-full text-sm hover:bg-[#d4c1b0] transition-colors"
                >
                  你都了解哪些agent技术栈
                </button>
                <button
                  onClick={() => {
                    setInputValue("讲一下你的agent项目");
                  }}
                  className="px-4 py-2 bg-[#E8D5C4] text-[#2C241B] rounded-full text-sm hover:bg-[#d4c1b0] transition-colors"
                >
                  讲一下你的agent项目
                </button>
                <button
                  onClick={() => {
                    setInputValue("在生活中你的爱好是什么");
                  }}
                  className="px-4 py-2 bg-[#E8D5C4] text-[#2C241B] rounded-full text-sm hover:bg-[#d4c1b0] transition-colors"
                >
                  在生活中你的爱好是什么
                </button>
              </div>
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${
                message.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-[70%] rounded-2xl px-4 py-3 shadow-sm ${
                  message.role === "user"
                    ? "bg-[#E8D5C4] text-[#2C241B] rounded-br-sm"
                    : "bg-white border border-[#E8D5C4] text-[#2C241B] rounded-bl-sm"
                }`}
              >
                <div className="whitespace-pre-wrap leading-relaxed">
                  <MarkdownRenderer content={message.content} />
                </div>
              </div>
            </div>
          ))}

          {isStreaming && messages[messages.length - 1]?.content === "" && (
            <div className="flex justify-start">
              <div className="bg-white border border-[#E8D5C4] rounded-2xl rounded-bl-sm px-4 py-3 text-[#8B7355]">
                正在思考...
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* 输入区域 */}
      <footer className="border-t border-[#E8D5C4] bg-white/50 backdrop-blur-sm px-4 py-4 md:px-8">
        <div className="max-w-[800px] mx-auto">
          <div className="flex gap-3 items-center">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入你的问题..."
              disabled={isStreaming}
              className="flex-1 h-12 px-5 rounded-full border border-[#E8D5C4] bg-white focus:outline-none focus:ring-2 focus:ring-[#B8860B]/30 focus:border-[#B8860B] text-[#2C241B] placeholder-[#8B7355]/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <button
              onClick={() => sendMessage()}
              disabled={isStreaming || !inputValue.trim()}
              className="w-12 h-12 rounded-full bg-[#B8860B] text-white flex items-center justify-center hover:scale-105 active:scale-95 transition-transform disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              aria-label="发送消息"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                />
              </svg>
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}