import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Toaster } from "@/components/Toaster";
import { ConfirmProvider } from "@/components/ConfirmDialog";
import { TopProgressBar } from "@/components/TopProgressBar";
import { NavLink } from "@/components/NavLink";
import { KbdHelp } from "@/components/KbdHelp";
import { TooltipProvider } from "@/components/ui/tooltip";

export const metadata: Metadata = {
  title: "TestPilot AI",
  description: "QA copilot: generate tests, distil DOM, build self-healing Playwright suites with Claude / GPT / Gemini.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="flex min-h-screen flex-col bg-background font-sans">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <TooltipProvider delayDuration={300}>
            <Toaster>
              <ConfirmProvider>
                <TopProgressBar />
                <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
                  <div className="container flex h-14 items-center gap-4">
                    <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold tracking-tight" aria-label="TestPilot AI home">
                      <span className="grid h-7 w-7 place-items-center rounded-md bg-primary text-primary-foreground">
                        <Sparkles className="h-4 w-4" aria-hidden />
                      </span>
                      <span className="hidden whitespace-nowrap sm:inline">TestPilot AI</span>
                      <span className="whitespace-nowrap sm:hidden">QA</span>
                    </Link>
                    <nav className="flex flex-1 items-center gap-1 overflow-x-auto" aria-label="Main">
                      <NavLink href="/">Projects</NavLink>
                      <NavLink href="/chat">Chat</NavLink>
                      <NavLink href="/locators">DOM Tools</NavLink>
                      <NavLink href="/tickets">Tickets</NavLink>
                    </nav>
                    <div className="ml-auto flex shrink-0 items-center gap-1">
                      <ThemeToggle />
                      <NavLink href="/settings">Settings</NavLink>
                    </div>
                  </div>
                </header>
                <main className="container flex-1 py-6 sm:py-8">{children}</main>
                <footer className="container mt-16 border-t py-4 text-xs text-muted-foreground">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>TestPilot AI · v0.2 · BYOK · runs locally</span>
                    <span className="flex items-center gap-3">
                      <Link className="hover:text-foreground" href="/settings">Settings</Link>
                      <span>Press <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono">?</kbd> for shortcuts</span>
                    </span>
                  </div>
                </footer>
                <KbdHelp />
              </ConfirmProvider>
            </Toaster>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
