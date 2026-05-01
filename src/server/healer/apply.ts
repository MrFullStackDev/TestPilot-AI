import fs from "node:fs";
import path from "node:path";
import { db } from "@/server/db/client";
import { projectOutDir } from "@/server/crawler/paths";

// Apply an accepted heal proposal:
//  - update locators.json (the healer reference)
//  - update tests.locator_meta_json
//  - rewrite the matching getter in the page object .ts file
export function applyHeal(eventId: number): { ok: true } | { ok: false; reason: string } {
  const event = db().prepare("SELECT * FROM heal_events WHERE id = ?").get(eventId) as
    | { id: number; test_id: number | null; old_locator: string; new_locator: string; accepted: number }
    | undefined;
  if (!event) return { ok: false, reason: "event not found" };
  if (event.accepted) return { ok: false, reason: "already accepted" };
  if (!event.test_id) return { ok: false, reason: "no test linked" };

  const oldL = JSON.parse(event.old_locator) as { key: string; strategy: string; value: string };
  const newL = JSON.parse(event.new_locator) as { key: string; strategy: string; value: string };

  const test = db().prepare("SELECT * FROM tests WHERE id = ?").get(event.test_id) as { id: number; project_id: number; locator_meta_json: string | null; page_object_path: string | null };
  const project = db().prepare("SELECT slug FROM projects WHERE id = ?").get(test.project_id) as { slug: string };

  const root = projectOutDir(project.slug);

  // 1. update tests.locator_meta_json (move new strategy to top)
  if (test.locator_meta_json) {
    const meta = JSON.parse(test.locator_meta_json) as Record<string, Array<{ strategy: string; value: string }>>;
    if (meta[oldL.key]) {
      meta[oldL.key] = [{ strategy: newL.strategy, value: newL.value }, ...meta[oldL.key].filter((c) => !(c.strategy === newL.strategy && c.value === newL.value))];
      db().prepare("UPDATE tests SET locator_meta_json = ? WHERE id = ?").run(JSON.stringify(meta), test.id);
    }
  }

  // 2. update .testgen/locators.json
  const locFile = path.join(root, ".testgen/locators.json");
  if (fs.existsSync(locFile)) {
    try {
      const all = JSON.parse(fs.readFileSync(locFile, "utf8"));
      if (all[oldL.key]) {
        all[oldL.key] = [{ strategy: newL.strategy, value: newL.value }, ...all[oldL.key].filter((c: any) => !(c.strategy === newL.strategy && c.value === newL.value))];
        fs.writeFileSync(locFile, JSON.stringify(all, null, 2));
      }
    } catch {}
  }

  // 3. patch the page-object .ts file
  const [poName, alias] = oldL.key.split(".");
  const poFile = path.join(root, "page-objects", `${pascal(poName)}.ts`);
  if (fs.existsSync(poFile)) {
    const src = fs.readFileSync(poFile, "utf8");
    const re = new RegExp(`(get\\s+${escapeRe(alias)}\\s*\\(\\)\\s*:\\s*Locator\\s*\\{\\s*return\\s+)([^;]+)(;\\s*\\})`, "m");
    if (re.test(src)) {
      const newExpr = renderLocatorExpr(newL.strategy, newL.value);
      const updated = src.replace(re, `$1${newExpr}$3`);
      fs.writeFileSync(poFile, updated);
    }
  }

  // 4. mark accepted
  db().prepare("UPDATE heal_events SET accepted = 1 WHERE id = ?").run(eventId);

  return { ok: true };
}

function pascal(s: string): string {
  const cleaned = s.replace(/[^a-zA-Z0-9]/g, "");
  return cleaned[0]?.toUpperCase() + cleaned.slice(1) || "Page";
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderLocatorExpr(strategy: string, value: string): string {
  const v = JSON.stringify(value);
  switch (strategy) {
    case "testid": return `this.page.getByTestId(${v})`;
    case "role": {
      const m = value.match(/^([a-zA-Z]+)(?:\s+name=(.+))?$/);
      if (m) {
        const role = JSON.stringify(m[1]);
        if (m[2]) return `this.page.getByRole(${role}, { name: ${JSON.stringify(m[2].replace(/^['"]|['"]$/g, ""))} })`;
        return `this.page.getByRole(${role})`;
      }
      return `this.page.locator(${v})`;
    }
    case "label":       return `this.page.getByLabel(${v})`;
    case "placeholder": return `this.page.getByPlaceholder(${v})`;
    case "text":        return `this.page.getByText(${v}, { exact: false })`;
    case "css":         return `this.page.locator(${v})`;
    case "xpath":       return `this.page.locator(${JSON.stringify("xpath=" + value)})`;
    default:            return `this.page.locator(${v})`;
  }
}
