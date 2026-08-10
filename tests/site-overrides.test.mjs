import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import path from "node:path"
import vm from "node:vm"
import { rootDir } from "../scripts/lib.mjs"

const bundleSource = await readFile(path.join(rootDir, ".build", "addons", "site-overrides", "content-bundle.js"), "utf8")

describe("site override context companion", () => {
  test("runs without extension APIs and remains idempotent across duplicate injection", async () => {
    let removeCalls = 0
    let observerCount = 0
    const domReadyListeners = []
    const documentElement = { dataset: {} }
    const document = {
      readyState: "loading",
      documentElement,
      addEventListener(type, listener) {
        if (type === "DOMContentLoaded") domReadyListeners.push(listener)
      },
      querySelectorAll(selector) {
        return selector === "div.post-access-cta" ? [{ remove: () => removeCalls++ }] : []
      },
    }
    class MutationObserver {
      constructor() {
        observerCount++
      }
      observe() {}
      disconnect() {}
    }
    const context = vm.createContext({
      document,
      location: new URL("https://www.404media.co/article"),
      MutationObserver,
      setTimeout() {},
      console,
    })

    vm.runInContext(bundleSource, context)
    await Promise.resolve()
    vm.runInContext(bundleSource, context)
    await Promise.resolve()
    expect(context.TRAWLHALLA_SITE_CONFIG).toBeUndefined()
    expect(context.trawlhallaSiteModules).toBeUndefined()

    document.readyState = "complete"
    for (const listener of domReadyListeners) listener()
    await Promise.resolve()

    expect(removeCalls).toBe(1)
    expect(observerCount).toBe(1)
    expect(documentElement.dataset.trawlhallaSiteLoader).toBe("404-media")
    expect(documentElement.dataset.trawlhallaSite).toBe("404-media")
  })

  test("retains a deferred site module after the page-world globals are cleaned up", async () => {
    const domReadyListeners = []
    const documentElement = { dataset: {} }
    let gateRemoved = 0
    let articleReplaced = 0
    const gate = { remove: () => gateRemoved++ }
    const article = { replaceWith: () => articleReplaced++ }
    const nextData = { textContent: JSON.stringify({ content: `<p>${"recovered ".repeat(60)}</p>` }) }
    const replacement = { querySelectorAll: () => [] }
    const document = {
      readyState: "loading",
      documentElement,
      addEventListener(type, listener) {
        if (type === "DOMContentLoaded") domReadyListeners.push(listener)
      },
      querySelector(selector) {
        if (selector.includes("ContentGate_wrapper")) return gate
        if (selector.includes("PostContent_wrapper")) return article
        if (selector === "script#__NEXT_DATA__") return nextData
      },
      querySelectorAll: () => [],
    }
    class MutationObserver {
      observe() {}
      disconnect() {}
    }
    class DOMParser {
      parseFromString() {
        return { body: { firstElementChild: replacement } }
      }
    }
    const context = vm.createContext({
      document,
      location: new URL("https://www.aftermath.site/article"),
      MutationObserver,
      DOMParser,
      setTimeout() {},
      console,
    })

    vm.runInContext(bundleSource, context)
    expect(context.trawlhallaSiteModules).toBeUndefined()
    document.readyState = "complete"
    for (const listener of domReadyListeners) listener()
    await Promise.resolve()
    await Promise.resolve()

    expect(gateRemoved).toBe(1)
    expect(articleReplaced).toBe(1)
    expect(documentElement.dataset.trawlhallaAftermathRecovered).toBe("true")
    expect(documentElement.dataset.trawlhallaSite).toBe("aftermath")
  })
})
