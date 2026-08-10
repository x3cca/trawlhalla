"use strict"

const api = globalThis.browser ?? globalThis.chrome
const config = globalThis.TRAWLHALLA_SITE_CONFIG

function matches(pattern, rawUrl) {
  if (pattern === "<all_urls>") return /^(https?|file|ftp):/.test(rawUrl)
  const parsed = /^(\*|https?|file|ftp):\/\/([^/]+)(\/.*)$/.exec(pattern)
  if (!parsed) return false
  let url
  try {
    url = new URL(rawUrl)
  } catch {
    return false
  }
  const [, scheme, hostPattern, pathPattern] = parsed
  if (scheme !== "*" && url.protocol !== `${scheme}:`) return false
  if (scheme === "*" && url.protocol !== "http:" && url.protocol !== "https:") return false
  const hostname = url.hostname.toLowerCase()
  const wantedHost = hostPattern.toLowerCase()
  if (wantedHost.startsWith("*.")) {
    const root = wantedHost.slice(2)
    if (hostname !== root && !hostname.endsWith(`.${root}`)) return false
  } else if (wantedHost !== "*" && hostname !== wantedHost) {
    return false
  }
  const escaped = pathPattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*")
  return new RegExp(`^${escaped}$`).test(`${url.pathname}${url.search}`)
}

function siteForUrl(rawUrl) {
  if (!rawUrl) return undefined
  return config.sites.find((site) => site.matches.some((pattern) => matches(pattern, rawUrl)))
}

async function injectSiteOverride(tabId, rawUrl) {
  const site = siteForUrl(rawUrl)
  if (!site) return
  const marker = JSON.stringify(site.id)
  const loaded = await api.tabs
    .executeScript(tabId, {
      code: `document.documentElement.dataset.trawlhallaSiteLoader === ${marker}`,
    })
    .catch(() => [])
  if (loaded?.[0]) return
  await api.tabs.executeScript(tabId, { file: "runtime-config.js" })
  if (site.module) await api.tabs.executeScript(tabId, { file: `site-modules/${site.module}` })
  await api.tabs.executeScript(tabId, { file: "content.js" })
}

function sourcePageUrl(details) {
  return details.documentUrl || details.originUrl || (details.type === "main_frame" ? details.url : "")
}

if (config.networkListenerPatterns.length > 0) {
  api.webRequest.onBeforeRequest.addListener(
    (details) => {
      const site = siteForUrl(sourcePageUrl(details))
      if (!site || site.network.block.length === 0) return {}
      return site.network.block.some((pattern) => new RegExp(pattern).test(details.url)) ? { cancel: true } : {}
    },
    { urls: config.networkListenerPatterns },
    ["blocking"],
  )

  api.webRequest.onBeforeSendHeaders.addListener(
    (details) => {
      const site = siteForUrl(sourcePageUrl(details))
      if (!site || Object.keys(site.network.requestHeaders).length === 0) return {}
      const headers = [...(details.requestHeaders ?? [])]
      for (const [name, value] of Object.entries(site.network.requestHeaders)) {
        const current = headers.find((header) => header.name.toLowerCase() === name.toLowerCase())
        if (current) current.value = String(value)
        else headers.push({ name, value: String(value) })
      }
      return { requestHeaders: headers }
    },
    { urls: config.networkListenerPatterns },
    ["blocking", "requestHeaders"],
  )
}

// Camoufox installs unpacked add-ons temporarily. Firefox can occasionally miss
// static content-script registration for that installation mode, so inject the
// same narrowly scoped scripts after navigation as a fallback.
api.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete") void injectSiteOverride(tabId, tab.url).catch(() => {})
})

api.runtime.onMessage.addListener(async (message, sender) => {
  if (message?.type !== "trawlhalla:clean-cookies" || typeof message.siteId !== "string") return
  const site = config.sites.find((candidate) => candidate.id === message.siteId)
  const pageUrl = typeof message.pageUrl === "string" ? message.pageUrl : sender.tab?.url
  if (!site || !pageUrl || !site.matches.some((pattern) => matches(pattern, pageUrl))) return
  const names = new Set(site.cookies.remove)
  if (names.size === 0) return
  const cookies = await api.cookies.getAll({ url: pageUrl })
  await Promise.all(
    cookies
      .filter((cookie) => names.has(cookie.name))
      .map((cookie) => {
        const scheme = cookie.secure ? "https" : "http"
        const domain = cookie.domain.replace(/^\./, "")
        return api.cookies.remove({ url: `${scheme}://${domain}${cookie.path || "/"}`, name: cookie.name })
      }),
  )
})
