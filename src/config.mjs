import { readFile } from "node:fs/promises"

const MATCH_PATTERN = /^(\*|https?|file|ftp):\/\/([^/]+)(\/.*)$/

export function validateMatchPattern(pattern, label = "match pattern") {
  if (pattern === "<all_urls>") return
  const match = MATCH_PATTERN.exec(pattern)
  if (!match) throw new Error(`${label} is not a valid WebExtension match pattern: ${pattern}`)
  const host = match[2]
  if (host.includes("*") && !host.startsWith("*.")) {
    throw new Error(`${label} has an unsupported host wildcard: ${pattern}`)
  }
}

export function matchWebExtensionPattern(pattern, rawUrl) {
  if (pattern === "<all_urls>") return /^(https?|file|ftp):/.test(rawUrl)
  const match = MATCH_PATTERN.exec(pattern)
  if (!match) return false
  let url
  try {
    url = new URL(rawUrl)
  } catch {
    return false
  }
  const [, scheme, hostPattern, pathPattern] = match
  if (scheme !== "*" && url.protocol !== `${scheme}:`) return false
  if (scheme === "*" && !["http:", "https:"].includes(url.protocol)) return false
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

function stringArray(value, label) {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
    throw new Error(`${label} must be an array of non-empty strings`)
  }
  return [...new Set(value.map((item) => item.trim()))]
}

function selectorObjects(value, label, field) {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`)
  return value.map((entry, index) => {
    if (!entry || typeof entry !== "object" || typeof entry.selector !== "string") {
      throw new Error(`${label}[${index}] requires a selector`)
    }
    return { selector: entry.selector, [field]: stringArray(entry[field], `${label}[${index}].${field}`) }
  })
}

export function validateCustomSitesConfig(raw) {
  if (!raw || typeof raw !== "object" || raw.schemaVersion !== 1 || !Array.isArray(raw.sites)) {
    throw new Error("custom-sites.json must have schemaVersion 1 and a sites array")
  }
  const ids = new Set()
  const sites = raw.sites.map((site, index) => {
    const label = `sites[${index}]`
    if (!site || typeof site !== "object" || !/^[a-z0-9][a-z0-9-]*$/.test(site.id ?? "")) {
      throw new Error(`${label}.id must use lowercase letters, digits, and hyphens`)
    }
    if (ids.has(site.id)) throw new Error(`duplicate site id: ${site.id}`)
    ids.add(site.id)
    const matches = stringArray(site.matches, `${label}.matches`)
    if (!matches.length) throw new Error(`${label}.matches cannot be empty`)
    matches.forEach((pattern) => validateMatchPattern(pattern, `${label}.matches`))
    const networkPermissions = stringArray(site.network?.permissions, `${label}.network.permissions`)
    networkPermissions.forEach((pattern) => validateMatchPattern(pattern, `${label}.network.permissions`))
    const block = stringArray(site.network?.block, `${label}.network.block`)
    block.forEach((pattern) => {
      try {
        new RegExp(pattern)
      } catch (error) {
        throw new Error(`${label}.network.block contains invalid regex ${pattern}: ${error.message}`)
      }
    })
    const requestHeaders = site.network?.requestHeaders ?? {}
    if (!requestHeaders || typeof requestHeaders !== "object" || Array.isArray(requestHeaders)) {
      throw new Error(`${label}.network.requestHeaders must be an object`)
    }
    const actions = site.actions ?? {}
    const styles = actions.styles ?? []
    if (!Array.isArray(styles)) throw new Error(`${label}.actions.styles must be an array`)
    for (const [styleIndex, style] of styles.entries()) {
      if (!style || typeof style.selector !== "string" || !style.properties || typeof style.properties !== "object") {
        throw new Error(`${label}.actions.styles[${styleIndex}] requires selector and properties`)
      }
    }
    const setAttributes = actions.setAttributes ?? []
    if (!Array.isArray(setAttributes)) throw new Error(`${label}.actions.setAttributes must be an array`)
    for (const [attributeIndex, entry] of setAttributes.entries()) {
      if (!entry || typeof entry.selector !== "string" || !entry.attributes || typeof entry.attributes !== "object") {
        throw new Error(`${label}.actions.setAttributes[${attributeIndex}] requires selector and attributes`)
      }
    }
    return {
      id: site.id,
      enabled: site.enabled === true,
      description: typeof site.description === "string" ? site.description : "",
      matches,
      forceBrowser: site.forceBrowser !== false,
      observeMs: Number.isFinite(site.observeMs) ? Math.max(0, site.observeMs) : undefined,
      cookies: { remove: stringArray(site.cookies?.remove, `${label}.cookies.remove`) },
      network: { permissions: networkPermissions, block, requestHeaders },
      actions: {
        remove: stringArray(actions.remove, `${label}.actions.remove`),
        unwrap: stringArray(actions.unwrap, `${label}.actions.unwrap`),
        unhide: stringArray(actions.unhide, `${label}.actions.unhide`),
        click: stringArray(actions.click, `${label}.actions.click`),
        removeClasses: selectorObjects(actions.removeClasses, `${label}.actions.removeClasses`, "classes"),
        removeAttributes: selectorObjects(actions.removeAttributes, `${label}.actions.removeAttributes`, "attributes"),
        setAttributes,
        styles,
      },
      module: site.module === undefined ? undefined : String(site.module),
    }
  })
  return {
    schemaVersion: 1,
    defaults: { observeMs: Number.isFinite(raw.defaults?.observeMs) ? Math.max(0, raw.defaults.observeMs) : 10_000 },
    sites,
  }
}

export async function readCustomSitesConfig(path) {
  return validateCustomSitesConfig(JSON.parse(await readFile(path, "utf8")))
}

export function enabledSites(config) {
  return config.sites.filter((site) => site.enabled)
}

export function uniquePatterns(sites, selector) {
  return [...new Set(sites.flatMap(selector))].sort()
}
