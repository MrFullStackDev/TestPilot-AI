"use client";
import { useTheme } from "next-themes";
import { Moon, Sun, Monitor, Check } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme, resolvedTheme } = useTheme();
  useEffect(() => setMounted(true), []);

  if (!mounted) return <Button variant="ghost" size="icon" aria-label="Theme" />;

  const Icon = (resolvedTheme ?? theme) === "dark" ? Moon : Sun;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Theme">
          <Icon className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        {(["light", "dark", "system"] as const).map((t) => (
          <DropdownMenuItem key={t} onSelect={() => setTheme(t)}>
            {t === "light" && <Sun className="mr-2 h-4 w-4" />}
            {t === "dark" && <Moon className="mr-2 h-4 w-4" />}
            {t === "system" && <Monitor className="mr-2 h-4 w-4" />}
            <span className="capitalize">{t}</span>
            {theme === t && <Check className="ml-auto h-4 w-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
