import { copyFile, mkdir, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { latestBpcArtifact, readLock, rootDir, run, sha256, submoduleCommit, xpiManifest } from "./lib.mjs"

const target = process.argv[2]
if (target !== "trawl" && target !== "bpc") throw new Error("Usage: bun scripts/sync-upstream.mjs <trawl|bpc>")

const lock = await readLock()
const relativePath = target === "trawl" ? "upstream/trawl" : "upstream/bpc-uploads"
run("git", ["submodule", "update", "--init", "--remote", "--recursive", relativePath])

if (target === "trawl") {
  lock.trawl.commit = submoduleCommit(relativePath)
} else {
  lock.bpc.commit = submoduleCommit(relativePath)
  const directory = path.join(rootDir, relativePath)
  const latest = await latestBpcArtifact(directory)
  const artifactPath = path.join(directory, latest.name)
  const manifest = await xpiManifest(artifactPath)
  if (manifest.version !== latest.version) {
    throw new Error(`Artifact filename ${latest.version} does not match manifest ${manifest.version}`)
  }
  lock.bpc.artifact = latest.name
  lock.bpc.version = latest.version
  lock.bpc.sha256 = await sha256(artifactPath)
  const vendorDirectory = path.join(rootDir, "vendor", "bpc")
  await rm(vendorDirectory, { recursive: true, force: true })
  await mkdir(vendorDirectory, { recursive: true })
  await copyFile(artifactPath, path.join(vendorDirectory, latest.name))
}

await writeFile(path.join(rootDir, "upstream.lock.json"), `${JSON.stringify(lock, null, 2)}\n`)
console.log(`Updated ${target} lock; run bun run verify before committing`)
