"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useEffect } from "react";

const MAX_MESSAGE_CHARS = 800;

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  // Truncate so a giant error can't blow out the layout. The full message is
  // already in the browser console (above) and the server log.
  const safeMessage = (error?.message ?? "Unknown error").slice(0, MAX_MESSAGE_CHARS);
  const truncated = (error?.message?.length ?? 0) > MAX_MESSAGE_CHARS;
  return (
    <div className="mx-auto max-w-xl">
      <Card>
        <CardHeader>
          <CardTitle>Something went wrong</CardTitle>
          <CardDescription>The page crashed while rendering.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <pre className="max-h-72 overflow-auto rounded bg-muted p-3 text-xs whitespace-pre-wrap break-words">
            {safeMessage}{truncated ? "\n…(truncated, see console)" : ""}{error.digest ? `\ndigest: ${error.digest}` : ""}
          </pre>
          <div className="flex gap-2">
            <Button onClick={reset}>Try again</Button>
            <Button variant="outline" asChild><Link href="/">Go home</Link></Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
