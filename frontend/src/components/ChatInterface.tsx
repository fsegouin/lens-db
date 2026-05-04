"use client";

import { useState, useRef, useEffect } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Send } from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

const transport = new DefaultChatTransport({ api: "/api/chat" });

const STARTER_PROMPTS = [
  "What's the lightest 85mm ƒ/1.4 for full frame?",
  "Compare Sigma Art vs Sony GM primes",
  "Manual-focus 50mm under 250g",
  "Which E-mount wide primes are weather sealed?",
];

function formatForMarkdown(text: string): string {
  const lines = text.split("\n");
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isBoldLine = /^\*\*/.test(line.trim());
    const prevIsBoldLine = i > 0 && /^\*\*/.test(lines[i - 1].trim());
    const nextIsBoldLine =
      i < lines.length - 1 && /^\*\*/.test(lines[i + 1].trim());

    if (isBoldLine && (prevIsBoldLine || nextIsBoldLine)) {
      if (!prevIsBoldLine) result.push("");
      result.push(`- ${line.trim()}`);
      if (!nextIsBoldLine) result.push("");
    } else {
      result.push(line);
    }
  }
  return result.join("\n").replace(/\n{3,}/g, "\n\n");
}

function formatTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes(),
  ).padStart(2, "0")}`;
}

function AssistantAvatar() {
  return (
    <div className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--line-strong)] bg-[var(--surface-sunk)] text-[var(--fg)]">
      <svg width="14" height="14" viewBox="0 0 28 28" fill="none" aria-hidden="true">
        <circle cx="14" cy="14" r="11" stroke="currentColor" strokeWidth="1.25" />
        <g stroke="currentColor" strokeWidth="0.9">
          <path d="M14 4 L17 10" />
          <path d="M23 8 L16 12" />
          <path d="M21 21 L15 15" />
          <path d="M8 23 L12 16" />
          <path d="M4 15 L10 14" />
          <path d="M6 6 L13 11" />
        </g>
        <circle cx="14" cy="14" r="2" fill="currentColor" />
      </svg>
    </div>
  );
}

function UserAvatar() {
  return (
    <div className="mono flex h-7 w-7 items-center justify-center rounded-full border border-border bg-[var(--surface-soft)] text-[10px] tracking-[0.04em] text-[var(--fg-mid)]">
      YOU
    </div>
  );
}

export default function ChatInterface() {
  const { messages, sendMessage, status, error } = useChat({ transport });
  const [input, setInput] = useState("");
  const [sessionId] = useState(() =>
    Math.random().toString(36).slice(2, 6).toUpperCase(),
  );
  const startTime = useRef<number>(Date.now());
  const inputRef = useRef<HTMLInputElement>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);

  const isLoading = status === "submitted" || status === "streaming";

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isLoading]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    startTime.current = Date.now();
    sendMessage({ text: input });
    setInput("");
  }

  function submitPrompt(text: string) {
    if (isLoading) return;
    startTime.current = Date.now();
    sendMessage({ text });
    setInput("");
    inputRef.current?.focus();
  }

  return (
    <div className="mx-auto w-full max-w-[900px] px-6 pb-44 pt-10 lg:px-10">
      <header className="mb-6 border-b border-border pb-4">
        <div className="mono mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] tracking-[0.02em] text-[var(--fg-dim)]">
          <span>
            <span className="text-[var(--fg-faint)]">LDB</span> CHAT · session{" "}
            {sessionId}
          </span>
          <span className="text-[var(--fg-faint)]">·</span>
          <span>grounded retrieval</span>
          <span className="ml-auto inline-flex items-center gap-1.5 text-[var(--pos)]">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--pos)]" />
            {isLoading ? "thinking" : "listening"}
          </span>
        </div>
        <h1 className="text-[34px] font-medium leading-[1.05] -tracking-[0.025em]">
          Ask the <em className="hero-title-em">DB</em>
        </h1>
        <div className="mono mt-2 text-[12px] text-[var(--fg-dim)]">
          Conversational interface, grounded on the full database. Answers can
          cite specific lenses and cameras.
        </div>
      </header>

      {messages.length === 0 && (
        <div className="mb-8 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {STARTER_PROMPTS.map((prompt, i) => (
            <button
              key={prompt}
              type="button"
              onClick={() => submitPrompt(prompt)}
              disabled={isLoading}
              className="flex items-center gap-3 rounded-[10px] border border-border bg-background px-4 py-3.5 text-left text-[13px] text-[var(--fg-mid)] transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--surface-soft)] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="mono shrink-0 rounded border border-border bg-[var(--surface-soft)] px-1.5 py-0.5 text-[9px] tracking-[0.1em] text-[var(--fg-faint)]">
                {String(i + 1).padStart(2, "0")}
              </span>
              {prompt}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-8">
        {messages.map((message, idx) => {
          const isUser = message.role === "user";
          const text = message.parts
            .filter((p) => p.type === "text")
            .map((p) => p.text)
            .join("");
          const isLast = idx === messages.length - 1;
          const elapsed = isLast && !isUser
            ? Date.now() - startTime.current
            : null;
          return (
            <div key={message.id} className="flex flex-col gap-2.5">
              <div className="mono flex items-center gap-2.5 text-[10px] tracking-[0.04em] text-[var(--fg-faint)]">
                {isUser ? <UserAvatar /> : <AssistantAvatar />}
                <span>
                  {isUser ? "you" : "lens-db"} · {formatTime(new Date())}
                  {elapsed != null && elapsed < 60_000 && (
                    <> · {elapsed}ms</>
                  )}
                </span>
              </div>
              {isUser ? (
                <div className="ml-9 max-w-[640px] rounded-[10px] border border-border bg-[var(--surface-soft)] px-4 py-2.5 text-[14px] leading-[1.55] text-foreground">
                  {text}
                </div>
              ) : (
                <div className="prose prose-zinc dark:prose-invert ml-9 max-w-none text-[14px] leading-[1.55] prose-p:my-3 prose-a:text-foreground prose-a:underline prose-a:underline-offset-2 prose-a:decoration-[var(--line-strong)] hover:prose-a:decoration-foreground prose-strong:font-medium prose-strong:text-foreground prose-li:my-1">
                  <Markdown remarkPlugins={[remarkGfm]}>
                    {formatForMarkdown(text)}
                  </Markdown>
                </div>
              )}
            </div>
          );
        })}

        {isLoading &&
          (messages.length === 0 ||
            messages[messages.length - 1]?.role === "user") && (
            <div className="flex flex-col gap-2.5">
              <div className="mono flex items-center gap-2.5 text-[10px] tracking-[0.04em] text-[var(--fg-faint)]">
                <AssistantAvatar />
                <span className="animate-pulse">lens-db · waiting</span>
              </div>
              <div className="mono ml-9 text-[12px] text-[var(--fg-faint)]">
                ▌ thinking…
              </div>
            </div>
          )}

        <div ref={threadEndRef} />
      </div>

      {error && (
        <div className="mono mt-6 text-center text-[12px] text-[var(--hot)]">
          ● Something went wrong. Please try again.
        </div>
      )}

      <ChatComposer
        input={input}
        setInput={setInput}
        onSubmit={handleSubmit}
        isLoading={isLoading}
        inputRef={inputRef}
      />
    </div>
  );
}

function ChatComposer({
  input,
  setInput,
  onSubmit,
  isLoading,
  inputRef,
}: {
  input: string;
  setInput: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  isLoading: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-10 border-t border-border bg-background/85 backdrop-blur-xl lg:left-[var(--app-rail-width,0px)]">
      <div className="mx-auto w-full max-w-[900px] px-6 py-4 lg:px-10">
        <form onSubmit={onSubmit}>
          <div className="flex items-center gap-2 rounded-[10px] border border-border bg-[var(--surface-soft)] px-3 py-2 transition-colors focus-within:border-[var(--line-strong)]">
            <span className="mono text-[10px] tracking-[0.1em] text-[var(--fg-faint)]">
              {">"}
            </span>
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about lenses, cameras, mount systems…"
              disabled={isLoading}
              className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-[var(--fg-faint)] disabled:opacity-60"
            />
            <span className="mono hidden rounded border border-border bg-background px-1.5 py-0.5 text-[10px] tracking-[0.04em] text-[var(--fg-faint)] sm:inline">
              ⌘ ↵
            </span>
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="mono flex items-center gap-1 rounded-md bg-foreground px-3 py-1.5 text-[12px] font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
            >
              Send
              <Send className="h-3 w-3" strokeWidth={2} />
            </button>
          </div>
          <div className="mono mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[10px] tracking-[0.02em] text-[var(--fg-faint)]">
            <span className="flex items-center gap-1.5">
              <span className="text-[var(--pos)]">●</span> grounded on LDB ·
              7,400+ lenses · 1,000+ cameras
            </span>
            <span className="hidden sm:inline">↵ send · esc clear</span>
          </div>
        </form>
      </div>
    </div>
  );
}
