import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Fraunces } from "next/font/google";
import { AppShell } from "@/components/app-shell/app-shell";
import { ThemeProvider } from "@/components/theme-provider";
import { UserProvider } from "@/components/user-context";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "The Lens DB - Camera Lens Database",
  description:
    "Comprehensive database of camera lenses and bodies with specs, compatibility, and expert recommendations.",
  metadataBase: new URL("https://thelensdb.com"),
  verification: {
    google: "VqQ5eoCMbzHnK0tn55oyWCiTeUUgh8hfFaRNo6OfoDk",
  },
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
        className={`${GeistSans.variable} ${GeistMono.variable} ${fraunces.variable} font-sans antialiased`}
      >
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <UserProvider>
            <TooltipProvider>
              <AppShell>{children}</AppShell>
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
