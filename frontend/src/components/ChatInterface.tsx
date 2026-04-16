"use client";

import { useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Send } from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

const transport = new DefaultChatTransport({ api: "/api/chat" });

/**
 * Pre-process LLM text so it renders well as markdown.
 * Adds blank lines between lines that look like separate items
 * (e.g. lines starting with bold text) so markdown doesn't
 * collapse them into a single paragraph.
 */
function formatForMarkdown(text: string): string {
  return text.replace(/\n(?=\*\*)/g, "\n\n");
}

export default function ChatInterface() {
  const { messages, sendMessage, status, error } = useChat({ transport });
  const [input, setInput] = useState("");

  const isLoading = status === "submitted" || status === "streaming";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    sendMessage({ text: input });
    setInput("");
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 max-w-3xl mx-auto w-full">
      {/* Messages */}
      <div className={`flex-1 overflow-y-auto pb-20 ${messages.length === 0 ? "flex items-center justify-center" : "space-y-4"}`}>
        {messages.length === 0 && (
          <div className="text-center text-zinc-500 dark:text-zinc-400">
            <p className="text-lg font-medium mb-2">Ask me anything about cameras and lenses</p>
            <div className="space-y-1 text-sm">
              <p>&ldquo;Which Nikon F camera was the first with autofocus?&rdquo;</p>
              <p>&ldquo;What&apos;s the cheapest Sony E mount camera on the second-hand market?&rdquo;</p>
              <p>&ldquo;Compare 50mm f/1.4 lenses for Canon EF&rdquo;</p>
            </div>
          </div>
        )}
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-lg ${
                message.role === "user"
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 whitespace-pre-wrap px-4 py-2 text-sm"
                  : "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100 px-5 py-4 prose prose-zinc dark:prose-invert prose-p:leading-relaxed prose-p:my-3 prose-headings:my-3 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-table:my-3 prose-pre:my-2 max-w-none text-[0.9rem] [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
              }`}
            >
              {message.role === "user"
                ? message.parts
                    .filter((p) => p.type === "text")
                    .map((p, i) => <span key={i}>{p.text}</span>)
                : message.parts
                    .filter((p) => p.type === "text")
                    .map((p, i) => <Markdown key={i} remarkPlugins={[remarkGfm]}>{formatForMarkdown(p.text)}</Markdown>)}
            </div>
          </div>
        ))}
        {isLoading && messages[messages.length - 1]?.role === "user" && (
          <div className="flex justify-start">
            <div className="bg-zinc-100 dark:bg-zinc-800 rounded-lg px-4 py-2 text-sm text-zinc-500">
              Thinking...
            </div>
          </div>
        )}
      </div>

      {/* Input — floating at bottom */}
      <div className="fixed bottom-4 left-0 right-0 z-10 px-4">
        <div className="mx-auto max-w-3xl">
          {error && (
            <div className="text-red-500 text-sm mb-2 text-center">
              Something went wrong. Please try again.
            </div>
          )}
          <form onSubmit={handleSubmit} className="relative">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about cameras, lenses, prices..."
              className="w-full rounded-full border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 pl-5 pr-12 py-3 text-sm shadow-lg focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:focus:ring-zinc-500"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-zinc-900 dark:bg-zinc-100 p-2 text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
