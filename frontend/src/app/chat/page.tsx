import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ChatInterface from "@/components/ChatInterface";
import { chatEnabled } from "@/proxy";

export const metadata: Metadata = {
  title: "Chat",
  description: "Ask questions about cameras, lenses, and mount systems",
};

export default function ChatPage() {
  if (!chatEnabled()) notFound();
  return (
    <>
      <style>{`[data-slot="separator"], footer { display: none !important; }`}</style>
      <div className="flex flex-col flex-1 min-h-0">
        <h1 className="text-xl font-bold mb-3 shrink-0">Chat with The Lens DB</h1>
        <ChatInterface />
      </div>
    </>
  );
}
