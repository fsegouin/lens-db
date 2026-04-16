import { Metadata } from "next";
import ChatInterface from "@/components/ChatInterface";

export const metadata: Metadata = {
  title: "Chat | The Lens DB",
  description: "Ask questions about cameras, lenses, and mount systems",
};

export default function ChatPage() {
  return (
    <main className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Chat with The Lens DB</h1>
      <ChatInterface />
    </main>
  );
}
