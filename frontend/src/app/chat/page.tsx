import { Metadata } from "next";
import ChatInterface from "@/components/ChatInterface";

export const metadata: Metadata = {
  title: "Chat | The Lens DB",
  description: "Ask questions about cameras, lenses, and mount systems",
};

export default function ChatPage() {
  return (
    <main className="container mx-auto flex flex-col px-4 py-4 h-[calc(100dvh-var(--header-height,4rem))] overflow-hidden">
      <h1 className="text-xl font-bold mb-3 shrink-0">Chat with The Lens DB</h1>
      <ChatInterface />
    </main>
  );
}
