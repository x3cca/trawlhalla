globalThis.trawlhallaSiteModules ??= {}

globalThis.trawlhallaSiteModules.aftermath = async ({ document }) => {
  if (document.documentElement.dataset.trawlhallaAftermathRecovered === "true") return

  const gate = document.querySelector("[class^='ContentGate_wrapper'], [class*=' ContentGate_wrapper']")
  const article = document.querySelector("[class^='PostContent_wrapper'], [class*=' PostContent_wrapper']")
  const nextData = document.querySelector("script#__NEXT_DATA__")
  if (!gate || !article || !nextData?.textContent) return

  const wantedKeys = new Set(["blocks", "body", "bodyplaintext", "content", "contenthtml", "description", "html"])
  const findArticleContent = (value) => {
    if (Array.isArray(value)) {
      for (const item of value) {
        const match = findArticleContent(item)
        if (match) return match
      }
      return ""
    }
    if (!value || typeof value !== "object") return ""
    for (const [key, item] of Object.entries(value)) {
      if (wantedKeys.has(key.toLowerCase()) && typeof item === "string" && item.length > 500) return item
    }
    for (const item of Object.values(value)) {
      const match = findArticleContent(item)
      if (match) return match
    }
    return ""
  }

  let embedded
  try {
    embedded = JSON.parse(nextData.textContent)
  } catch {
    return
  }
  const articleHtml = findArticleContent(embedded)
  if (!articleHtml) return

  const parsed = new DOMParser().parseFromString(`<div>${articleHtml}</div>`, "text/html")
  const replacement = parsed.body.firstElementChild
  if (!replacement) return

  replacement.querySelectorAll("script, iframe, object, embed").forEach((element) => element.remove())
  replacement.querySelectorAll("*").forEach((element) => {
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase()
      const value = attribute.value.trim().toLowerCase()
      if (name.startsWith("on") || name === "srcdoc" || ((name === "href" || name === "src") && value.startsWith("javascript:"))) {
        element.removeAttribute(attribute.name)
      }
    }
  })

  article.replaceWith(replacement)
  gate.remove()
  document.documentElement.dataset.trawlhallaAftermathRecovered = "true"
}
