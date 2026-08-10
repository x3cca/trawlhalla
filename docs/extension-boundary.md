# Extension permission and data-flow boundary

## Bypass Paywalls Clean

The pinned Firefox artifact is Manifest V2. Its background entry points are `sites.js` and `background.js`. It requests `cookies`, `storage`, `activeTab`, `webRequest`, `webRequestBlocking`, and a large set of host permissions. Depending on the matched rule, it can alter request headers and cookies, inject scripts, change page DOM, or contact configured archive/content hosts.

The pinned source artifact is hash-verified and never modified in place. Build preparation unpacks a generated copy, applies the fail-fast headless compatibility patch queue and removes its runtime update URL, because Trawlhalla updates extensions through reviewed, hashed image rebuilds.

## Custom-site extension

The generated companion extension has:

- background entry points `runtime-config.js` and `background.js`;
- content entry points `runtime-config.js`, enabled site modules, and `content.js`;
- cookie and blocking web-request permissions;
- only the host permissions derived from enabled custom rules.

Custom modules run in Firefox's isolated extension world. They can read and modify the DOM of their configured sites but do not share JavaScript globals with the page.

## Request flow

```text
API request
  -> generated browser policy
  -> Tier 1 skipped for matching hosts
  -> Camoufox browser with BPC + custom extension
  -> background request/cookie hooks
  -> content-script DOM transformations
  -> DOM-settle window
  -> Trawl page.content() response
```

No personal Firefox profile is mounted. Sessions and cookies belong to Trawl's browser contexts. Any archive or external-host traffic requested by a rule leaves through the Trawl container's configured network path.
