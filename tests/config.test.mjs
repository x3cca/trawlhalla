import { describe, expect, test } from "bun:test"
import { matchWebExtensionPattern, validateCustomSitesConfig } from "../src/config.mjs"

describe("WebExtension match patterns", () => {
  test("matches a root host and its subdomains", () => {
    expect(matchWebExtensionPattern("*://*.ft.com/*", "https://www.ft.com/content/abc")).toBe(true)
    expect(matchWebExtensionPattern("*://*.ft.com/*", "https://ft.com/content/abc")).toBe(true)
    expect(matchWebExtensionPattern("*://*.ft.com/*", "https://notft.com/content/abc")).toBe(false)
  })

  test("honours scheme and path", () => {
    expect(matchWebExtensionPattern("https://example.com/articles/*", "https://example.com/articles/1?q=x")).toBe(true)
    expect(matchWebExtensionPattern("https://example.com/articles/*", "http://example.com/articles/1")).toBe(false)
  })
})

describe("custom-site config", () => {
  test("normalizes a minimal enabled site", () => {
    const config = validateCustomSitesConfig({
      schemaVersion: 1,
      sites: [{ id: "local-news", enabled: true, matches: ["*://news.example/*"] }],
    })
    expect(config.sites[0].actions.remove).toEqual([])
    expect(config.sites[0].forceBrowser).toBe(true)
  })

  test("rejects duplicate ids", () => {
    expect(() =>
      validateCustomSitesConfig({
        schemaVersion: 1,
        sites: [
          { id: "duplicate", matches: ["*://one.example/*"] },
          { id: "duplicate", matches: ["*://two.example/*"] },
        ],
      }),
    ).toThrow("duplicate site id")
  })
})
