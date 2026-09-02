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
  title: {
    default: "The Lens DB: Camera and Lens Reference",
    template: "%s | The Lens DB",
  },
  description:
    "An open reference for interchangeable camera lenses, camera bodies and lens mounts: specifications, what fits what, and used prices.",
  metadataBase: new URL("https://thelensdb.com"),
  verification: {
    google: "VqQ5eoCMbzHnK0tn55oyWCiTeUUgh8hfFaRNo6OfoDk",
  },
  openGraph: {
    title: "The Lens DB: Camera and Lens Reference",
    description:
      "An open reference for interchangeable camera lenses, camera bodies and lens mounts: specifications, what fits what, and used prices.",
    siteName: "The Lens DB",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "The Lens DB: Camera and Lens Reference",
    description:
      "An open reference for interchangeable camera lenses, camera bodies and lens mounts: specifications, what fits what, and used prices.",
  },
};

const footerSections = [
  {
    title: "Browse",
    links: [
      { href: "/lenses", label: "Lenses" },
      { href: "/cameras", label: "Cameras" },
      { href: "/systems", label: "Mounts" },
      { href: "/collections", label: "Collections" },
      { href: "/lenses/series", label: "Series" },
    ],
  },
  {
    title: "Tools",
    links: [
      { href: "/compare", label: "Compare" },
      { href: "/search", label: "Search" },
      { href: "/chat", label: "Ask the database" },
    ],
  },
  {
    title: "Contribute",
    links: [
      { href: "/submit", label: "Submit a lens or camera" },
      { href: "/register", label: "Create an account" },
      { href: "/login", label: "Sign in" },
    ],
  },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} font-sans antialiased flex flex-col min-h-dvh`}
      >
        {/* Light by default: dense tables and long prose are what this site is
            for, and both read worse in inverted polarity. Dark stays available
            from the toggle and follows the OS once chosen. */}
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
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
            <main className="mx-auto flex flex-col flex-1 min-h-0 w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
              {children}
            </main>
            <Separator />
            <footer>
              <div className="mx-auto max-w-7xl space-y-8 px-4 py-10 sm:px-6 lg:px-8">
                <div className="grid gap-8 sm:grid-cols-3">
                  {footerSections.map((section) => (
                    <div key={section.title}>
                      <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                        {section.title}
                      </h2>
                      <ul className="mt-3 space-y-2">
                        {section.links.map((link) => (
                          <li key={link.href}>
                            <Link
                              href={link.href}
                              className="text-sm text-muted-foreground underline-offset-2 hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-100"
                            >
                              {link.label}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
                <div className="space-y-2 border-t border-border pt-6">
                  <p className="text-sm text-muted-foreground">
                    The Lens DB, a community reference for camera lenses,
                    bodies and mounts.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    As an eBay Partner Network affiliate, The Lens DB earns from
                    qualifying purchases.
                  </p>
                </div>
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
