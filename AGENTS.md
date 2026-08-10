# Repository instructions

- Treat `upstream/trawl` and `upstream/bpc-uploads` as read-only submodules.
- Put Trawl adaptations in `patches/trawl`; keep them generic and minimal.
- Put unavoidable headless BPC adaptations in `patches/bpc`; never edit the unpacked build output.
- Put local site support in `config/custom-sites.json` and `config/site-modules`.
- Do not replace a versioned BPC artifact with `latest.xpi` in a reproducible build.
- Run `bun run verify` after integration, configuration, patch, or lock changes.
- Update Trawl and BPC in separate commits and pull requests.
