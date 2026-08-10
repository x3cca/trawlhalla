import { createHash } from "node:crypto"
import { execFileSync, spawnSync } from "node:child_process"
import { readFile, readdir } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { strFromU8, unzipSync } from "fflate"

export const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

export async function readLock() {
  return JSON.parse(await readFile(path.join(rootDir, "upstream.lock.json"), "utf8"))
}

export function git(...args) {
  return execFileSync("git", args, { cwd: rootDir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim()
}

export function submoduleCommit(relativePath) {
  return git("-C", relativePath, "rev-parse", "HEAD")
}

export async function sha256(filePath) {
  const data = await readFile(filePath)
  return createHash("sha256").update(data).digest("hex")
}

export async function xpiEntries(filePath) {
  return unzipSync(new Uint8Array(await readFile(filePath)))
}

export async function xpiManifest(filePath) {
  const entries = await xpiEntries(filePath)
  if (!entries["manifest.json"]) throw new Error(`${filePath} does not contain manifest.json`)
  return JSON.parse(strFromU8(entries["manifest.json"]))
}

export async function latestBpcArtifact(directory) {
  const files = await readdir(directory)
  const candidates = files
    .map((name) => ({ name, match: /^bypass_paywalls_clean-(\d+\.\d+\.\d+\.\d+)\.xpi$/.exec(name) }))
    .filter((entry) => entry.match)
    .map((entry) => ({ name: entry.name, version: entry.match[1] }))
    .sort((a, b) => {
      const left = a.version.split(".").map(Number)
      const right = b.version.split(".").map(Number)
      for (let index = 0; index < Math.max(left.length, right.length); index++) {
        const delta = (right[index] ?? 0) - (left[index] ?? 0)
        if (delta) return delta
      }
      return 0
    })
  if (!candidates.length) throw new Error(`No versioned BPC Firefox XPI found in ${directory}`)
  return candidates[0]
}

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: rootDir, stdio: "inherit", ...options })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} exited with status ${result.status}`)
}
