import { DEMO_PROJECT_IDS, DEMO_TEST_IDS } from "@/lib/demo-data";
import Client from "./client";

export function generateStaticParams() {
  const out: { id: string; testId: string }[] = [];
  for (const id of DEMO_PROJECT_IDS) {
    for (const testId of DEMO_TEST_IDS) {
      out.push({ id: String(id), testId: String(testId) });
    }
  }
  return out;
}

export default function Page() {
  return <Client />;
}
