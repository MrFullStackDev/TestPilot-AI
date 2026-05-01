// Server-Sent Events helper. Returns a Response that streams JSON events.

export type SseSink = {
  send(event: Record<string, unknown>): void;
  close(): void;
};

export function sseStream(handler: (sink: SseSink) => Promise<void>): Response {
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let closed = false;
      const send = (event: Record<string, unknown>) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      const close = () => {
        if (closed) return;
        closed = true;
        try { controller.close(); } catch {}
      };
      try {
        await handler({ send, close });
      } catch (e: any) {
        send({ type: "error", message: e?.message ?? String(e) });
      } finally {
        close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
