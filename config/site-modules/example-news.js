/*
 * Optional advanced rule module. It runs in the extension's isolated content-script
 * world after declarative actions have been applied. Copy this file, change the key
 * to match a site's `id`, and enable that site in custom-sites.json.
 */
globalThis.trawlhallaSiteModules ??= {}
globalThis.trawlhallaSiteModules["example-news"] = async ({ document, firstRun }) => {
  if (!firstRun) return
  document.documentElement.dataset.trawlhallaCustomRule = "example-news"
}
