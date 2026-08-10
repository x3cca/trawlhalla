# Integration and maintenance plan

## Objective

Produce a Trawl image that loads a pinned Bypass Paywalls Clean Firefox extension while preserving straightforward updates from both upstream projects and supporting local site rules outside BPC's official list.

## Architecture

1. Track Trawl and `bpc_uploads` as read-only Git submodules.
2. Record immutable commits, BPC version, artifact filename and SHA-256 in `upstream.lock.json`.
3. Copy Trawl into `.build/trawl` and apply a small patch queue. Never modify the submodule in place.
4. Verify and unpack the pinned BPC XPI into `.build/addons/bpc`, then apply the small fail-fast headless patch queue in `patches/bpc/`.
5. Generate a separate custom-site Firefox extension from `config/custom-sites.json` and `config/site-modules/`.
6. Generate the Tier-1 browser policy from BPC host permissions plus enabled custom-site match patterns.
7. Build Trawl's upstream Dockerfile with Podman or Docker first, then add both extension directories and the browser policy in a thin final image.

## Trawl patch boundary

The patch queue contains only generic integration primitives:

- load unpacked Camoufox add-on directories from `CAMOUFOX_ADDON_DIRS`;
- force configured match patterns past Tier 1 using `TRAWL_FORCE_BROWSER_PATTERNS_FILE`;
- wait for browser DOM mutations to settle before capturing final HTML.

BPC names, versions and site rules must not appear in the Trawl patch queue.

The BPC patch queue contains only runtime adaptations required by this headless, pinned deployment. In particular, the current patch preserves BPC's self-hosted enablement after its manifest updater is removed. A BPC update must fail if that assumption no longer applies.

## Custom-site model

Simple sites use declarative DOM, cookie and network actions. Complex sites add a module under `config/site-modules/`. Generated host permissions include only enabled rules. Local rules are reviewed and tested independently from BPC upgrades.

## Upstream update workflow

Trawl and BPC updates are always separate changes:

1. Advance one submodule.
2. Update only its lock fields.
3. Run `bun run verify`.
4. For Trawl, require every patch to apply cleanly and review changed tier/browser behavior.
5. For BPC, verify the artifact hash, manifest version, permissions and Firefox minimum version, then require every BPC patch to apply cleanly.
6. Build the image and run the local extension fixture tests when Podman or Docker is available.
7. Open a PR named `sync/trawl-<sha>` or `sync/bpc-<version>`.

If a Trawl patch fails, rebase that patch against the new upstream rather than editing the submodule. If BPC changes manifest format or moves away from a compatible Firefox extension model, fail the update until the loader and permission review are updated.

## Verification gates

- Submodule commits equal `upstream.lock.json`.
- BPC artifact SHA-256 and manifest version match the lock.
- Trawl patches pass `git apply --check` against the pinned tree.
- Custom-site configuration, selectors, regular expressions and host patterns validate.
- Generated extension manifests are valid and contain only enabled custom rules.
- Browser policy includes official BPC patterns and enabled custom patterns.
- Unit tests pass.
- Container image build and browser smoke test pass where Podman or Docker is available.

## Future improvements

- Contribute the generic Camoufox add-on hook upstream to Trawl, then drop patch 0001.
- Add a local HTTP fixture server and Camoufox smoke test that confirms both extensions mutate a controlled page.
- Add response metadata showing which custom rule ran.
- Add per-request policy modes (`off`, `auto`, `force`) without changing FlareSolverr compatibility.
- Split normal and extension-enabled browser pools if untrusted multi-tenant workloads are introduced.
