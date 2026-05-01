// Identify which locator key actually failed by parsing the Playwright error.
// We look for explicit `getByTestId('x')`, `getByRole('button', { name: 'Sign in' })`,
// `getByLabel('Email')`, `getByPlaceholder('Email')`, `getByText('foo')`, or `locator('css')`
// patterns in the error message and match their args against the stored locator
// candidates.

type Candidate = { strategy: string; value: string };
type Meta = Record<string, Candidate[]>;

export function identifyFailingKey(error: string | null | undefined, meta: Meta, primaryKey: string | null = null): string | null {
  if (!error) return primaryKey;

  // Extract every (strategy, value) pair we can find in the error.
  const pairs: Candidate[] = [];

  for (const m of error.matchAll(/getByTestId\(['"`]([^'"`]+)['"`]\)/g)) pairs.push({ strategy: "testid", value: m[1] });
  for (const m of error.matchAll(/getByLabel\(['"`]([^'"`]+)['"`]/g))    pairs.push({ strategy: "label", value: m[1] });
  for (const m of error.matchAll(/getByPlaceholder\(['"`]([^'"`]+)['"`]/g)) pairs.push({ strategy: "placeholder", value: m[1] });
  for (const m of error.matchAll(/getByText\(['"`]([^'"`]+)['"`]/g))     pairs.push({ strategy: "text", value: m[1] });
  for (const m of error.matchAll(/getByRole\(['"`]([^'"`]+)['"`](?:,\s*\{\s*name:\s*['"`]([^'"`]+)['"`]\s*\})?\)/g)) {
    pairs.push({ strategy: "role", value: m[2] ? `${m[1]} name=${m[2]}` : m[1] });
  }
  for (const m of error.matchAll(/locator\(['"`]([^'"`]+)['"`]\)/g)) {
    const v = m[1];
    if (v.startsWith("xpath=")) pairs.push({ strategy: "xpath", value: v.slice(6) });
    else pairs.push({ strategy: "css", value: v });
  }

  for (const candidate of pairs) {
    for (const [key, candList] of Object.entries(meta)) {
      for (const c of candList) {
        if (c.strategy === candidate.strategy && c.value === candidate.value) {
          return key;
        }
      }
    }
  }
  return primaryKey;
}
