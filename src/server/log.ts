// Pino-based logging. Logs go to data/logs/app.log (created lazily) AND, in
// development, also to stdout for visibility. We avoid pino-pretty as a runtime
// dep — for personal use the JSON is fine.
import fs from "node:fs";
import path from "node:path";
import pino from "pino";

let _logger: pino.Logger | null = null;

export function logger(): pino.Logger {
  if (_logger) return _logger;
  const logsDir = path.resolve(process.cwd(), "data", "logs");
  fs.mkdirSync(logsDir, { recursive: true });
  const stream = pino.destination({ dest: path.join(logsDir, "app.log"), sync: false, mkdir: true });
  _logger = pino(
    {
      level: process.env.LOG_LEVEL ?? "info",
      base: { app: "ai-test-gen" },
      redact: ["req.headers.authorization", "req.headers.cookie"],
    },
    stream
  );
  return _logger;
}
