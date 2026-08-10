import { afterAll, describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { rootDir } from "../scripts/lib.mjs"
import { buildCustomExtension } from "../scripts/prepare.mjs"
import { validateCustomSitesConfig } from "../src/config.mjs"

const policyPath = path.join(rootDir, ".build", "runtime", "browser-policy.json")

describe("generated integration", () => {
  const originalPolicyPath = process.env.TRAWL_FORCE_BROWSER_PATTERNS_FILE

  afterAll(() => {
    if (originalPolicyPath === undefined) delete process.env.TRAWL_FORCE_BROWSER_PATTERNS_FILE
    else process.env.TRAWL_FORCE_BROWSER_PATTERNS_FILE = originalPolicyPath
  })

  test("routes BPC hosts to browser tiers", async () => {
    process.env.TRAWL_FORCE_BROWSER_PATTERNS_FILE = policyPath
    const modulePath = path.join(rootDir, ".build", "trawl", "packages", "tiers", "src", "utils", "browserPolicy.ts")
    const policyModule = await import(`${pathToFileURL(modulePath).href}?test=${Date.now()}`)
    expect(policyModule.shouldForceBrowser("https://www.ft.com/content/example")).toBe(true)
    expect(policyModule.shouldForceBrowser("https://www.404media.co/example")).toBe(true)
    expect(policyModule.shouldForceBrowser("https://aftermath.site/example")).toBe(true)
    expect(policyModule.shouldForceBrowser("https://example.invalid/article")).toBe(false)
  })

  test("includes only enabled custom sites in the generated manifest", async () => {
    const manifest = JSON.parse(
      await readFile(path.join(rootDir, ".build", "addons", "site-overrides", "manifest.json"), "utf8"),
    )
    expect(manifest.content_scripts[0].matches).toEqual(["*://*.404media.co/*", "*://*.aftermath.site/*"])
    expect(manifest.content_scripts[0].matches).not.toContain("*://*.example.com/*")
    expect(manifest.permissions).toContain("*://*.404media.co/*")
    expect(manifest.permissions).toContain("*://*.aftermath.site/*")
    expect(manifest.permissions).toContain("tabs")
    expect(manifest.permissions).not.toContain("*://*.example.com/*")
  })

  test("keeps pinned BPC enabled without a runtime updater", async () => {
    const bpcDir = path.join(rootDir, ".build", "addons", "bpc")
    const manifest = JSON.parse(await readFile(path.join(bpcDir, "manifest.json"), "utf8"))
    const background = await readFile(path.join(bpcDir, "background.js"), "utf8")
    expect(manifest.browser_specific_settings?.gecko?.update_url).toBeUndefined()
    expect(manifest.applications?.gecko?.update_url).toBeUndefined()
    expect(background).toContain("var self_hosted = true;")
    expect(background).not.toContain("var self_hosted = !!(manifestData.update_url")
  })

  test("generates syntactically valid classic extension scripts", async () => {
    for (const relative of [
      ".build/addons/site-overrides/runtime-config.js",
      ".build/addons/site-overrides/background.js",
      ".build/addons/site-overrides/content.js",
      ".build/addons/site-overrides/site-modules/aftermath.js",
    ]) {
      const source = await readFile(path.join(rootDir, relative), "utf8")
      expect(() => new Function(source)).not.toThrow()
    }
  })

  test("builds enabled custom sites with narrow generated permissions", async () => {
    const output = await mkdtemp(path.join(tmpdir(), "trawlhalla-site-extension-"))
    try {
      const config = validateCustomSitesConfig({
        schemaVersion: 1,
        sites: [
          {
            id: "local-news",
            enabled: true,
            matches: ["*://news.example/*"],
            network: { permissions: ["*://cdn.example/*"], block: ["paywall\\.js$"] },
            actions: { remove: [".paywall"] },
          },
        ],
      })
      await buildCustomExtension(config, output)
      const manifest = JSON.parse(await readFile(path.join(output, "manifest.json"), "utf8"))
      expect(manifest.content_scripts[0].matches).toEqual(["*://news.example/*"])
      expect(manifest.permissions).toContain("*://news.example/*")
      expect(manifest.permissions).toContain("*://cdn.example/*")
      expect(manifest.permissions).not.toContain("<all_urls>")
    } finally {
      await rm(output, { recursive: true, force: true })
    }
  })
})
