# Bloomberg HUMAN challenge classification

The pinned BPC artifact already contains Bloomberg's paywall and article-DOM rules. The retrieval failure is a separate upstream browser-tier issue.

## Classification

The sanitized diagnostic shape observed on 2026-08-10 was:

- the article request returned HTTP 403 with an empty Varnish response;
- `/tosv2.html` returned a page titled `Bloomberg - Are you a robot?`;
- the page contained a `px-captcha` mount and loaded `captcha.px-cdn.net`;
- the response set an `_pxhd` cookie; no `_abck` or `sec-cpt` Akamai markers were present.

This is HUMAN Bot Defender, formerly PerimeterX, in the PX3 family. It is not classified as Akamai from the press-and-hold appearance alone.

## Failure point before the patch

Trawl's detector returned `none` for the HUMAN page. Tier 3 then used the Cloudflare wait loop, which saw neither a Cloudflare title, URL, frame, nor clearance cookie and returned `ok` after two inactive samples. Trawl serialized the still-blocked page as a successful browser response. A cached session could likewise return the challenge as content because Tier 2 had no HUMAN wall check.

The Trawlhalla overlay adds a generic `human` challenge type, recognizes the stable HUMAN markers, performs a bounded press-and-hold attempt in the browser, revisits the requested URL only after a trust cookie appears, and reports a persistent wall as blocked. It does not log or store challenge tokens.

The regression fixture uses placeholder paths and contains no live app identifiers, cookies, reference IDs, or challenge tokens.
