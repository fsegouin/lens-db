import { Metadata } from "next";
import ChatInterface from "@/components/ChatInterface";

export const metadata: Metadata = {
  title: "Chat | The Lens DB",
  description: "Ask questions about cameras, lenses, and mount systems",
};

export default function ChatPage() {
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <h1 className="text-xl font-bold mb-3 shrink-0">Chat with The Lens DB</h1>
      <ChatInterface />
    </div>
  );
}
