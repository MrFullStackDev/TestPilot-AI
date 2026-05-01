import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import archiver from "archiver";
import { db } from "@/server/db/client";
import { projectOutDir } from "@/server/crawler/paths";

export const runtime = "nodejs";

// Stream a zip of the generated project. No external `zip` binary required.
export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const project = db().prepare("SELECT slug FROM projects WHERE id = ?").get(Number(params.id)) as { slug: string } | undefined;
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });
  const dir = projectOutDir(project.slug);
  if (!fs.existsSync(dir)) return NextResponse.json({ error: "project not generated" }, { status: 400 });

  const archive = archiver("zip", { zlib: { level: 9 } });
  // Add the directory but skip volatile / large folders
  archive.glob("**/*", {
    cwd: dir,
    ignore: ["node_modules/**", "test-results/**", "playwright-report/**", "playwright-report.json", ".env"],
    dot: true,
  });
  archive.finalize();

  // Bridge node Readable → web ReadableStream
  const webStream = Readable.toWeb(archive) as unknown as ReadableStream<Uint8Array>;
  return new Response(webStream, {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${project.slug}-tests.zip"`,
    },
  });
}
