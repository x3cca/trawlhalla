const mediaHtml = `<!doctype html>
<html>
  <head><title>Site override smoke fixture</title></head>
  <body>
    <article><p id="keep">kept</p></article>
    <div class="post-access-cta">REMOVE-ME</div>
  </body>
</html>`

const recoveredText = "Recovered Aftermath article content. ".repeat(20)
const embeddedData = JSON.stringify({ props: { pageProps: { content: `<div id="recovered">${recoveredText}</div>` } } })
const aftermathHtml = `<!doctype html>
<html>
  <head><title>Aftermath override smoke fixture</title></head>
  <body>
    <main class="PostContent_wrapper-fixture">TEASER-ONLY</main>
    <div class="ContentGate_wrapper-fixture">AFTERMATH-GATE</div>
    <script id="__NEXT_DATA__" type="application/json">${embeddedData.replaceAll("<", "\\u003c")}</script>
  </body>
</html>`

Bun.serve({
  hostname: "0.0.0.0",
  port: 8080,
  fetch(request) {
    const hostname = new URL(request.url).hostname
    const html = hostname.endsWith("aftermath.site") ? aftermathHtml : mediaHtml
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } })
  },
})

console.log("site-overrides smoke fixture listening on :8080")
