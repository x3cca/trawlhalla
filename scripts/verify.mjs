import { readFile } from "node:fs/promises"
import path from "node:path"
import { prepare } from "./prepare.mjs"
import { rootDir, run } from "./lib.mjs"

await prepare()

const policy = JSON.parse(await readFile(path.join(rootDir, ".build", "runtime", "browser-policy.json"), "utf8"))
if (!policy.patterns.some((pattern) => pattern.includes("ft.com"))) {
  throw new Error("Generated browser policy does not include ft.com")
}

const bpcManifest = JSON.parse(await readFile(path.join(rootDir, ".build", "addons", "bpc", "manifest.json"), "utf8"))
if (bpcManifest.manifest_version !== 2) throw new Error("Expected the Firefox BPC artifact to use Manifest V2")
if (bpcManifest.browser_specific_settings?.gecko?.update_url) throw new Error("Runtime BPC updates must remain disabled")

run(process.execPath, ["test", "tests/config.test.mjs", "tests/generated.test.mjs"])
console.log("Verification complete")
