import { describe, it, expect } from "vitest";
import { withLock, isLocked } from "../src/server/util/lock";

describe("withLock", () => {
  it("serialises calls under the same key", async () => {
    const order: string[] = [];
    const slow = (label: string, ms: number) => withLock("k", async () => {
      order.push(`start ${label}`);
      await new Promise((r) => setTimeout(r, ms));
      order.push(`end ${label}`);
    });
    await Promise.all([slow("a", 30), slow("b", 5), slow("c", 5)]);
    expect(order).toEqual(["start a", "end a", "start b", "end b", "start c", "end c"]);
  });

  it("lets different keys run concurrently", async () => {
    const order: string[] = [];
    const slow = (key: string, label: string) => withLock(key, async () => {
      order.push(`start ${label}`);
      await new Promise((r) => setTimeout(r, 20));
      order.push(`end ${label}`);
    });
    await Promise.all([slow("k1", "a"), slow("k2", "b")]);
    // Both starts must happen before any end.
    expect(order.indexOf("end a")).toBeGreaterThan(order.indexOf("start b"));
  });

  it("releases the lock when the body throws", async () => {
    await withLock("z", async () => { throw new Error("boom"); }).catch(() => {});
    expect(isLocked("z")).toBe(false);
  });
});
