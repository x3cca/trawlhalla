# Custom-site configuration

`custom-sites.json` is the local rule overlay. It is deliberately independent of BPC's upstream site database.

Only entries with `enabled: true` are included in the generated extension and browser policy.

## Site shape

```json
{
  "id": "local-news",
  "enabled": true,
  "description": "Optional note",
  "matches": ["*://*.news.example/*"],
  "forceBrowser": true,
  "observeMs": 10000,
  "cookies": {
    "remove": ["meter_cookie"]
  },
  "network": {
    "permissions": ["*://cdn.example/*"],
    "block": ["https?://cdn\\.example/paywall\\.js"],
    "requestHeaders": {
      "referer": "https://www.google.com/"
    }
  },
  "actions": {
    "remove": [".paywall"],
    "unwrap": [".article-wrapper"],
    "unhide": ["article"],
    "click": ["button.load-full-article"],
    "removeClasses": [{"selector": "body", "classes": ["modal-open"]}],
    "removeAttributes": [{"selector": "article", "attributes": ["hidden", "style"]}],
    "setAttributes": [{"selector": "article", "attributes": {"aria-hidden": "false"}}],
    "styles": [{"selector": "body", "properties": {"overflow": "auto"}}]
  },
  "module": "local-news.js"
}
```

`network.permissions` is required when a network rule needs to inspect a third-party host. Keep it as narrow as possible. Site `matches` are automatically included in the extension permissions.

Selectors that do not match are harmless. Invalid selectors are logged and skipped. The mutation observer reapplies declarative actions for dynamically rendered pages until `observeMs` expires.

## Advanced modules

Modules are ordinary content scripts in `config/site-modules/`. They register a function keyed by the site id:

```javascript
globalThis.trawlhallaSiteModules ??= {}
globalThis.trawlhallaSiteModules["local-news"] = async ({ document, location, site, firstRun }) => {
  if (!firstRun) return
  // Site-specific transformation.
}
```

Modules execute in Firefox's extension-isolated world and have DOM access to the configured matching pages. They do not execute in the page's JavaScript world.
