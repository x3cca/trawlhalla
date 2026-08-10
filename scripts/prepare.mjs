import { execFileSync } from "node:child_process"
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import { strFromU8 } from "fflate"
import { enabledSites, readCustomSitesConfig, uniquePatterns } from "../src/config.mjs"
import { readLock, rootDir, sha256, submoduleCommit, xpiEntries } from "./lib.mjs"

const buildDir = path.join(rootDir, ".build")

function safeEntryPath(base, entryName) {
  const normalized = entryName.replaceAll("\\", "/")
  const output = path.resolve(base, normalized)
  if (output !== base && !output.startsWith(`${base}${path.sep}`)) throw new Error(`unsafe XPI entry: ${entryName}`)
  return output
}

async function extractXpi(xpiPath, outputDir) {
  const entries = await xpiEntries(xpiPath)
  for (const [entryName, bytes] of Object.entries(entries)) {
    const output = safeEntryPath(outputDir, entryName)
    if (entryName.endsWith("/")) await mkdir(output, { recursive: true })
    else {
      await mkdir(path.dirname(output), { recursive: true })
      await writeFile(output, bytes)
    }
  }
}

function extensionPatterns(manifest) {
  return (manifest.permissions ?? []).filter(
    (permission) => typeof permission === "string" && (permission === "<all_urls>" || /^(\*|https?|file|ftp):\/\//.test(permission)),
  )
}

async function copyTrawlAndApplyPatches() {
  const source = path.join(rootDir, "upstream", "trawl")
  const destination = path.join(buildDir, "trawl")
  await cp(source, destination, {
    recursive: true,
    filter: (candidate) => path.basename(candidate) !== ".git",
  })
  await applyPatchQueue(destination, path.join(rootDir, "patches", "trawl"))
}

async function applyPatchQueue(destination, patchDirectory) {
  const patches = (await readdir(patchDirectory)).filter((name) => name.endsWith(".patch")).sort()
  if (!patches.length) throw new Error(`No integration patches found in ${path.relative(rootDir, patchDirectory)}`)
  // .build lives inside this integration repository, so Git otherwise discovers
  // the parent .git directory and skips paths relative to the generated trees.
  const directory = path.relative(rootDir, destination).replaceAll("\\", "/")
  for (const name of patches) {
    const patchPath = path.join(patchDirectory, name)
    execFileSync("git", ["apply", "--check", `--directory=${directory}`, patchPath], {
      cwd: rootDir,
      stdio: "inherit",
    })
    execFileSync("git", ["apply", `--directory=${directory}`, patchPath], { cwd: rootDir, stdio: "inherit" })
  }
}

export async function buildCustomExtension(config, outputDir) {
  const sites = enabledSites(config).map((site) => ({
    ...site,
    observeMs: site.observeMs ?? config.defaults.observeMs,
  }))
  const staticDir = path.join(rootDir, "extensions", "site-overrides")
  await mkdir(outputDir, { recursive: true })
  await cp(path.join(staticDir, "background.js"), path.join(outputDir, "background.js"))
  await cp(path.join(staticDir, "content.js"), path.join(outputDir, "content.js"))

  const modules = [...new Set(sites.map((site) => site.module).filter(Boolean))]
  for (const moduleName of modules) {
    const modulesRoot = path.resolve(rootDir, "config", "site-modules")
    const source = path.resolve(modulesRoot, moduleName)
    if (!source.startsWith(`${modulesRoot}${path.sep}`)) throw new Error(`custom module escapes site-modules: ${moduleName}`)
    if (!(await stat(source)).isFile()) throw new Error(`custom module is not a file: ${moduleName}`)
    const destination = path.join(outputDir, "site-modules", moduleName)
    await mkdir(path.dirname(destination), { recursive: true })
    await cp(source, destination)
  }

  const matches = uniquePatterns(sites, (site) => site.matches)
  const networkListenerPatterns = uniquePatterns(sites, (site) => [...site.matches, ...site.network.permissions])
  const runtimeConfig = { schemaVersion: 1, sites, networkListenerPatterns }
  await writeFile(
    path.join(outputDir, "runtime-config.js"),
    `globalThis.TRAWLHALLA_SITE_CONFIG = ${JSON.stringify(runtimeConfig, null, 2)}\n`,
  )
  const contentBundleFiles = ["runtime-config.js", ...modules.map((name) => `site-modules/${name}`), "content.js"]
  const contentBundle = await Promise.all(
    contentBundleFiles.map((name) => readFile(path.join(outputDir, name), "utf8")),
  )
  await writeFile(
    path.join(outputDir, "content-bundle.js"),
    `;(() => {\n${contentBundle.join("\n;\n")}\n;delete globalThis.TRAWLHALLA_SITE_CONFIG\n;delete globalThis.trawlhallaSiteModules\n})()\n`,
  )

  const permissions = sites.length
    ? ["cookies", "storage", "webRequest", "webRequestBlocking", ...networkListenerPatterns]
    : ["storage"]
  const manifest = {
    manifest_version: 2,
    name: "Trawlhalla Custom Site Overrides",
    version: "0.1.0",
    description: "Generated custom-site rules loaded beside the pinned BPC extension.",
    permissions: [...new Set(permissions)],
    background: { scripts: ["runtime-config.js", "background.js"] },
    ...(matches.length
      ? {
          content_scripts: [
            {
              matches,
              js: ["runtime-config.js", ...modules.map((name) => `site-modules/${name}`), "content.js"],
              run_at: "document_start",
            },
          ],
        }
      : {}),
    browser_specific_settings: {
      gecko: { id: "site-overrides@trawlhalla.local", strict_min_version: "109.0" },
    },
  }
  await writeFile(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`)
  return sites
}

export async function prepare() {
  const lock = await readLock()
  const trawlCommit = submoduleCommit("upstream/trawl")
  const bpcCommit = submoduleCommit("upstream/bpc-uploads")
  if (trawlCommit !== lock.trawl.commit) throw new Error(`Trawl lock mismatch: ${trawlCommit} != ${lock.trawl.commit}`)
  if (bpcCommit !== lock.bpc.commit) throw new Error(`BPC lock mismatch: ${bpcCommit} != ${lock.bpc.commit}`)

  const xpiPath = path.join(rootDir, "upstream", "bpc-uploads", lock.bpc.artifact)
  const actualHash = await sha256(xpiPath)
  if (actualHash !== lock.bpc.sha256) throw new Error(`BPC hash mismatch: ${actualHash} != ${lock.bpc.sha256}`)

  const config = await readCustomSitesConfig(path.join(rootDir, "config", "custom-sites.json"))
  await rm(buildDir, { recursive: true, force: true })
  await mkdir(buildDir, { recursive: true })
  await copyTrawlAndApplyPatches()

  const bpcDir = path.join(buildDir, "addons", "bpc")
  await extractXpi(xpiPath, bpcDir)
  await applyPatchQueue(bpcDir, path.join(rootDir, "patches", "bpc"))
  const manifestPath = path.join(bpcDir, "manifest.json")
  const bpcManifest = JSON.parse(await readFile(manifestPath, "utf8"))
  if (bpcManifest.version !== lock.bpc.version) {
    throw new Error(`BPC manifest version mismatch: ${bpcManifest.version} != ${lock.bpc.version}`)
  }
  if (bpcManifest.browser_specific_settings?.gecko) delete bpcManifest.browser_specific_settings.gecko.update_url
  if (bpcManifest.applications?.gecko) delete bpcManifest.applications.gecko.update_url
  await writeFile(manifestPath, `${JSON.stringify(bpcManifest, null, 2)}\n`)

  const licensesDir = path.join(buildDir, "licenses")
  await mkdir(licensesDir, { recursive: true })
  await cp(path.join(rootDir, "upstream", "trawl", "LICENSE"), path.join(licensesDir, "TRAWL-AGPL-3.0.txt"))
  await cp(path.join(bpcDir, "LICENSE"), path.join(licensesDir, "BPC-MIT.txt"))

  const customSites = await buildCustomExtension(config, path.join(buildDir, "addons", "site-overrides"))
  const bpcPatterns = extensionPatterns(bpcManifest)
  const customPatterns = uniquePatterns(
    customSites.filter((site) => site.forceBrowser),
    (site) => site.matches,
  )
  const policy = {
    schemaVersion: 1,
    generatedFrom: {
      trawlCommit,
      bpcCommit,
      bpcVersion: bpcManifest.version,
      customConfig: "config/custom-sites.json",
    },
    patterns: [...new Set([...bpcPatterns, ...customPatterns])].sort(),
  }
  await mkdir(path.join(buildDir, "runtime"), { recursive: true })
  await writeFile(path.join(buildDir, "runtime", "browser-policy.json"), `${JSON.stringify(policy, null, 2)}\n`)

  console.log(`Prepared Trawl ${trawlCommit.slice(0, 12)}`)
  console.log(`Prepared BPC ${bpcManifest.version} (${bpcPatterns.length} browser patterns)`)
  console.log(`Prepared ${customSites.length} enabled custom site(s)`)
}

if (import.meta.main) await prepare()
