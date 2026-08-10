ARG TRAWL_BASE_IMAGE=trawlhalla-trawl-base:local
FROM ${TRAWL_BASE_IMAGE}

ARG TRAWL_COMMIT
ARG BPC_COMMIT
ARG BPC_VERSION
ARG BPC_SHA256
ARG TRAWLHALLA_VERSION=dev
ARG TRAWLHALLA_REVISION=unknown
ARG TRAWLHALLA_CREATED=unknown

LABEL org.opencontainers.image.title="Trawlhalla" \
      org.opencontainers.image.source="https://github.com/x3cca/trawlhalla" \
      org.opencontainers.image.version="${TRAWLHALLA_VERSION}" \
      org.opencontainers.image.revision="${TRAWLHALLA_REVISION}" \
      org.opencontainers.image.created="${TRAWLHALLA_CREATED}" \
      org.opencontainers.image.licenses="AGPL-3.0-only" \
      io.trawlhalla.upstream.trawl.commit="${TRAWL_COMMIT}" \
      io.trawlhalla.upstream.bpc.commit="${BPC_COMMIT}" \
      io.trawlhalla.upstream.bpc.version="${BPC_VERSION}" \
      io.trawlhalla.upstream.bpc.sha256="${BPC_SHA256}"

COPY .build/addons/bpc/ /opt/camoufox/addons/BPC/
COPY .build/addons/site-overrides/ /opt/camoufox/addons/TRAWLHALLA_CUSTOM/
COPY .build/runtime/browser-policy.json /opt/trawlhalla/browser-policy.json
COPY .build/licenses/ /licenses/

ENV CAMOUFOX_ADDON_DIRS=/opt/camoufox/addons/BPC,/opt/camoufox/addons/TRAWLHALLA_CUSTOM \
    CAMOUFOX_CONTEXT_INIT_SCRIPT_FILES=/opt/camoufox/addons/TRAWLHALLA_CUSTOM/content-bundle.js \
    TRAWL_FORCE_BROWSER_PATTERNS_FILE=/opt/trawlhalla/browser-policy.json \
    TRAWL_DOM_SETTLE_MIN_MS=1500 \
    TRAWL_DOM_SETTLE_STABLE_MS=750 \
    TRAWL_DOM_SETTLE_POLL_MS=250 \
    TRAWL_DOM_SETTLE_MAX_MS=8000
