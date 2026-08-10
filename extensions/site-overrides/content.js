"use strict"

const api = globalThis.browser ?? globalThis.chrome
const config = globalThis.TRAWLHALLA_SITE_CONFIG

function matches(pattern, rawUrl) {
  if (pattern === "<all_urls>") return /^(https?|file|ftp):/.test(rawUrl)
  const parsed = /^(\*|https?|file|ftp):\/\/([^/]+)(\/.*)$/.exec(pattern)
  if (!parsed) return false
  const [, scheme, hostPattern, pathPattern] = parsed
  if (scheme !== "*" && location.protocol !== `${scheme}:`) return false
  if (scheme === "*" && location.protocol !== "http:" && location.protocol !== "https:") return false
  const hostname = location.hostname.toLowerCase()
  const wantedHost = hostPattern.toLowerCase()
  if (wantedHost.startsWith("*.")) {
    const root = wantedHost.slice(2)
    if (hostname !== root && !hostname.endsWith(`.${root}`)) return false
  } else if (wantedHost !== "*" && hostname !== wantedHost) {
    return false
  }
  const escaped = pathPattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*")
  return new RegExp(`^${escaped}$`).test(`${location.pathname}${location.search}`)
}

const site = config.sites.find((candidate) => candidate.matches.some((pattern) => matches(pattern, location.href)))

if (site && document.documentElement.dataset.trawlhallaSiteLoader !== site.id) {
  document.documentElement.dataset.trawlhallaSiteLoader = site.id
  let firstRun = true
  let applying = false

  const elements = (selector) => {
    try {
      return [...document.querySelectorAll(selector)]
    } catch (error) {
      console.warn(`[trawlhalla:${site.id}] invalid selector: ${selector}`, error)
      return []
    }
  }

  const apply = async () => {
    if (applying) return
    applying = true
    try {
      for (const selector of site.actions.remove) {
        for (const element of elements(selector)) element.remove()
      }
      for (const selector of site.actions.unwrap) {
        for (const element of elements(selector)) element.replaceWith(...element.childNodes)
      }
      for (const selector of site.actions.unhide) {
        for (const element of elements(selector)) {
          element.removeAttribute("hidden")
          element.removeAttribute("aria-hidden")
          element.style.removeProperty("display")
          element.style.removeProperty("visibility")
          element.style.removeProperty("opacity")
          element.style.removeProperty("max-height")
          element.style.removeProperty("overflow")
        }
      }
      for (const rule of site.actions.removeClasses) {
        for (const element of elements(rule.selector)) element.classList.remove(...rule.classes)
      }
      for (const rule of site.actions.removeAttributes) {
        for (const element of elements(rule.selector)) {
          for (const attribute of rule.attributes) element.removeAttribute(attribute)
        }
      }
      for (const rule of site.actions.setAttributes) {
        for (const element of elements(rule.selector)) {
          for (const [attribute, value] of Object.entries(rule.attributes)) element.setAttribute(attribute, String(value))
        }
      }
      for (const rule of site.actions.styles) {
        for (const element of elements(rule.selector)) {
          for (const [property, value] of Object.entries(rule.properties)) {
            element.style.setProperty(property, String(value), "important")
          }
        }
      }
      if (firstRun) {
        for (const selector of site.actions.click) elements(selector)[0]?.click()
      }
      const module = globalThis.trawlhallaSiteModules?.[site.id]
      if (typeof module === "function") await module({ document, location, site, firstRun })
      if (firstRun && site.cookies.remove.length > 0) {
        await api.runtime
          .sendMessage({ type: "trawlhalla:clean-cookies", siteId: site.id, pageUrl: location.href })
          .catch(() => {})
      }
      if (document.documentElement.dataset.trawlhallaSite !== site.id) {
        document.documentElement.dataset.trawlhallaSite = site.id
      }
      firstRun = false
    } finally {
      applying = false
    }
  }

  void apply()
  const observer = new MutationObserver(() => void apply())
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true })
  setTimeout(() => observer.disconnect(), site.observeMs)
}
