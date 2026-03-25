import type { Metadata } from "next";
import Link from "next/link";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import HeaderSearch from "@/components/HeaderSearch";
import { HeaderNav } from "@/components/header-nav";
import { MobileNav } from "@/components/mobile-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { ThemeProvider } from "@/components/theme-provider";
import { SearchProvider } from "@/components/search-context";
import { UserProvider } from "@/components/user-context";
import { UserMenu } from "@/components/user-menu";
import { Separator } from "@/components/ui/separator";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Lens DB - Camera Lens Database",
  description:
    "Comprehensive database of camera lenses and bodies with specs, compatibility, and expert recommendations.",
  metadataBase: new URL("https://thelensdb.com"),
  openGraph: {
    title: "The Lens DB - Camera Lens Database",
    description:
      "Comprehensive database of camera lenses and bodies with specs, compatibility, and expert recommendations.",
    siteName: "The Lens DB",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "The Lens DB - Camera Lens Database",
    description:
      "Comprehensive database of camera lenses and bodies with specs, compatibility, and expert recommendations.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} font-sans antialiased`}
      >
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <UserProvider>
          <TooltipProvider>
            <SearchProvider>
              <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
                <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
                  <Link
                    href="/"
                    className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100"
                  >
                    THE LENS DB
                  </Link>
                  <HeaderNav />
                  <div className="flex items-center gap-1">
                    <HeaderSearch />
                    <ThemeToggle />
                    <UserMenu />
                    <MobileNav />
                  </div>
                </div>
              </header>
            </SearchProvider>
            <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
              {children}
            </main>
            <Separator />
            <footer>
              <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
                <p className="text-center text-sm text-zinc-500">
                  The Lens DB &mdash; A community-driven camera lens database.
                  Originally inspired by lens-db.com (2012&ndash;2025).
                </p>
              </div>
            </footer>
          </TooltipProvider>
          </UserProvider>
        </ThemeProvider>
        <Analytics />
        <SpeedInsights />
        <Toaster />
      </body>
    </html>
  );
}
