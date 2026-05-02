import { DEMO_PROJECT_IDS } from "@/lib/demo-data";
import Client from "./client";

export function generateStaticParams() {
  return DEMO_PROJECT_IDS.map((id) => ({ id: String(id) }));
}

export default function Page() {
  return <Client />;
}
