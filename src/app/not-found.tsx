import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
      <h1 className="text-3xl font-bold tracking-tight">404</h1>
      <p className="text-sm text-muted-foreground">This page doesn't exist (or hasn't been generated yet).</p>
      <Button asChild><Link href="/">Back to Projects</Link></Button>
    </div>
  );
}
