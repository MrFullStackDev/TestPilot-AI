import { describe, it, expect } from "vitest";
import { identifyFailingKey } from "../src/server/healer/identify";

const meta = {
  "LoginPage.email":  [{ strategy: "testid", value: "email" }, { strategy: "label", value: "Email" }],
  "LoginPage.submit": [{ strategy: "role", value: "button name=Sign in" }, { strategy: "css", value: "button.primary" }],
  "HomePage.title":   [{ strategy: "role", value: "heading name=Welcome" }],
};

describe("identifyFailingKey", () => {
  it("matches getByTestId", () => {
    const err = `Locator: getByTestId('email') -> Timeout 30000ms exceeded`;
    expect(identifyFailingKey(err, meta)).toBe("LoginPage.email");
  });

  it("matches getByRole with name", () => {
    const err = `Locator: getByRole('button', { name: 'Sign in' }) -> not found`;
    expect(identifyFailingKey(err, meta)).toBe("LoginPage.submit");
  });

  it("matches getByLabel", () => {
    const err = `Locator: getByLabel('Email') -> not visible`;
    expect(identifyFailingKey(err, meta)).toBe("LoginPage.email");
  });

  it("falls back to primaryKey when nothing matches", () => {
    const err = `Some unrelated error nothing about locators here`;
    expect(identifyFailingKey(err, meta, "HomePage.title")).toBe("HomePage.title");
    expect(identifyFailingKey(err, meta, null)).toBe(null);
  });

  it("returns null for empty error and no primary", () => {
    expect(identifyFailingKey(null, meta)).toBe(null);
  });
});
