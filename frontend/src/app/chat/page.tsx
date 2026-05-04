import { Metadata } from "next";
import ChatInterface from "@/components/ChatInterface";
import { PageTransition } from "@/components/page-transition";
import { TopBar } from "@/components/app-shell/top-bar";

export const metadata: Metadata = {
  title: "Ask the DB | The Lens DB",
  description: "Ask questions about cameras, lenses, and mount systems",
};

export default function ChatPage() {
  return (
    <PageTransition>
      <TopBar crumbs={[{ label: "home", href: "/" }, { label: "ask the db" }]}>
        <span className="hidden sm:inline">grounded retrieval · gemini-2.5-flash</span>
        <span className="sm:hidden">gemini-2.5-flash</span>
      </TopBar>

      <ChatInterface />
    </PageTransition>
  );
}
