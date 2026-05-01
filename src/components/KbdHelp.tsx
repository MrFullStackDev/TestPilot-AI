"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

const SHORTCUTS: Array<{ keys: string[]; label: string; href?: string }> = [
  { keys: ["g", "p"], label: "Go to Projects", href: "/" },
  { keys: ["g", "c"], label: "Go to Chat", href: "/chat" },
  { keys: ["g", "l"], label: "Go to DOM Tools", href: "/locators" },
  { keys: ["g", "t"], label: "Go to Tickets", href: "/tickets" },
  { keys: ["g", "s"], label: "Go to Settings", href: "/settings" },
  { keys: ["?"],     label: "Show this help" },
  { keys: ["⌘ + Enter"], label: "Send chat message (in chat)" },
];

export function KbdHelp() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let buffer = "";
    let timer: ReturnType<typeof setTimeout> | null = null;
    function reset() { buffer = ""; if (timer) { clearTimeout(timer); timer = null; } }

    function onKey(e: KeyboardEvent) {
      // Ignore if user is typing in an input
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;

      if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        e.preventDefault();
        setOpen(true);
        reset();
        return;
      }
      buffer += e.key.toLowerCase();
      if (timer) clearTimeout(timer);
      timer = setTimeout(reset, 800);

      const map: Record<string, string> = {
        gp: "/",
        gc: "/chat",
        gl: "/locators",
        gt: "/tickets",
        gs: "/settings",
      };
      for (const k of Object.keys(map)) {
        if (buffer.endsWith(k)) {
          router.push(map[k]);
          reset();
          break;
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); if (timer) clearTimeout(timer); };
  }, [router]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Type the chord while not focused on an input. Press <kbd className="rounded border bg-muted px-1.5 py-0.5 text-xs">?</kbd> to open this anywhere.</DialogDescription>
        </DialogHeader>
        <ul className="divide-y text-sm">
          {SHORTCUTS.map((s) => (
            <li key={s.label} className="flex items-center justify-between py-2">
              <span>{s.label}</span>
              <span className="flex gap-1">
                {s.keys.map((k, i) => (
                  <kbd key={i} className="rounded border bg-muted px-1.5 py-0.5 text-xs font-mono">{k}</kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
