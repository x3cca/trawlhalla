# Trawlhalla

Trawlhalla is a reproducible integration layer around two independently tracked upstreams:

- [Trawl](https://github.com/x3cca/trawl/tree/codex/aws-waf-captcha), temporarily pinned to the fork's AWS WAF challenge fix while it is reviewed upstream, providing the API, browser pool, tier orchestration and Camoufox runtime.
- [Bypass Paywalls Clean Firefox uploads](https://gitflic.ru/project/magnolia1234/bpc_uploads), providing the pinned Firefox extension artifact.

It also generates a separate Firefox extension from `config/custom-sites.json`. Local site support therefore does not require editing BPC or either upstream submodule.

## Quick start

Requirements: Git, Bun 1.3 or newer, and a running Podman or Docker engine. The build script prefers Podman when both are available; set `CONTAINER_ENGINE` to override it.

On Windows or macOS, start Podman's existing machine first if needed:

```powershell
podman machine start
```

```powershell
git clone --recurse-submodules https://github.com/x3cca/trawlhalla.git
cd trawlhalla
bun install --frozen-lockfile
bun run verify
bun run build:image
podman run -d --name trawlhalla -p 8191:8191 --shm-size=1g --tmpfs /tmp:size=1g `
  -e BROWSER_POOL_SIZE=2 trawlhalla:local
```

With Docker, replace the final command with `docker compose up -d`. Podman Compose is optional; the direct `podman run` command does not require a Compose provider.

The native API is exposed at `http://localhost:8191/scrape`.

```powershell
curl.exe -s -X POST http://localhost:8191/scrape `
  -H "Content-Type: application/json" `
  -d '{"url":"https://www.ft.com/content/e4650e97-be1f-479d-8959-c892785abf49","maxTier":3,"maxTimeout":60000}'
```

Supported BPC and enabled custom-site patterns automatically skip Trawl's plain HTTP tier. Callers can still explicitly use `"skipHttp": true`.

A browser-tier `200` means the page rendered successfully; it does not guarantee that a BPC rule recovered full article text. Some BPC rules, including Financial Times, may fall back to an external archive link when no usable snapshot is available. Callers that require article text should validate the returned `html` rather than relying on status alone.

## Adding a custom site

Edit `config/custom-sites.json`, add a unique site object, and set `enabled` to `true`. A site can declare:

- `matches`: WebExtension match patterns controlling where the rule runs.
- `forceBrowser`: automatically skip Trawl Tier 1; defaults to `true`.
- `actions`: remove, unwrap, unhide, click, alter attributes/classes, or apply styles.
- `cookies.remove`: cookie names removed for that site.
- `network.block`: regular expressions for requests to cancel.
- `network.requestHeaders`: request headers to set or replace.
- `network.permissions`: explicit third-party hosts needed by network rules.
- `module`: an optional advanced module from `config/site-modules/`.

Start from the disabled `example-news` entry and module. Then run:

```powershell
bun run verify
bun run build:image
podman rm -f trawlhalla
podman run -d --name trawlhalla -p 8191:8191 --shm-size=1g --tmpfs /tmp:size=1g `
  -e BROWSER_POOL_SIZE=2 trawlhalla:local
```

The generated extension requests host access only for enabled custom rules. See `config/README.md` for the complete configuration contract.

## Updating upstreams

Update one upstream at a time:

```powershell
bun run sync:trawl
bun run verify
```

or:

```powershell
bun run sync:bpc
bun run verify
```

Each command advances one submodule and updates `upstream.lock.json`. Commit Trawl and BPC updates separately. CI also checks for updates on a schedule and opens separate PRs.

The scheduled `Upstream sync` workflow runs daily as independent `Sync Trawl` and `Sync BPC Firefox extension` jobs. A compatible update opens a focused PR. An incompatible update leaves the corresponding job failed, adds a diagnostic job summary, and opens no PR; that failed run is the intended queue item for an integration-fix agent.

Never edit files under `upstream/` directly. Integration changes belong in `patches/trawl/`, `patches/bpc/`, `extensions/`, `config/`, or `scripts/`.

## Build products

`bun run prepare` creates ignored output under `.build/`:

- a clean Trawl tree with the integration patches applied;
- the verified and unpacked BPC extension;
- the generated custom-site extension;
- a browser-routing policy generated from BPC permissions and enabled custom sites.

The final image carries OCI labels for both upstream commits plus the BPC version and SHA-256. Runtime extension updates are removed from the unpacked BPC manifest. A small BPC patch keeps that pinned artifact enabled in the headless profile; it fails closed during preparation if upstream changes the relevant code. Updating BPC is always an explicit, hashed rebuild. `CONTAINER_ARCH=amd64` or `arm64` can override engine architecture detection for a remote builder.

## Releases

Pushing the tag that matches `v<package.json version>` builds and smoke-tests a `linux/amd64` image on GitHub Actions. The workflow publishes a GitHub Release containing:

- `trawlhalla-linux-amd64.tar`, ready for `podman load` or `docker load`;
- `SHA256SUMS` and `image-metadata.json`;
- an SPDX JSON software bill of materials.

Actions also records a GitHub artifact attestation for the image archive. All third-party Actions are pinned to full commit SHAs, and the expensive Trawl layers use GitHub's BuildKit cache.

```bash
gh release download v0.1.0 --repo x3cca/trawlhalla --dir .artifacts/v0.1.0
cd .artifacts/v0.1.0
sha256sum --check SHA256SUMS
gh attestation verify trawlhalla-linux-amd64.tar --repo x3cca/trawlhalla
podman load --input trawlhalla-linux-amd64.tar
```

Release assets are versioned distribution artifacts, not a mutable deployment source. Deployment automation should pin the release tag and the archive SHA-256 from `SHA256SUMS`.

## Licensing

Trawlhalla's original integration code and Trawl are AGPL-3.0. Bypass Paywalls Clean is MIT licensed. Preserve the upstream license and attribution files and follow the AGPL obligations applicable to modified network deployments.
