import { spawnSync } from "node:child_process"
import { readLock, run } from "./lib.mjs"

function commandSucceeds(command, args) {
  const result = spawnSync(command, args, { stdio: "ignore" })
  return !result.error && result.status === 0
}

function commandOutput(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
  if (result.error || result.status !== 0) return undefined
  return result.stdout.trim()
}

function selectContainerEngine() {
  const requested = process.env.CONTAINER_ENGINE?.trim()
  if (requested) {
    if (!commandSucceeds(requested, ["info"])) {
      throw new Error(`CONTAINER_ENGINE=${requested} is unavailable or its daemon/machine is not running`)
    }
    return requested
  }

  for (const candidate of ["podman", "docker"]) {
    if (commandSucceeds(candidate, ["info"])) return candidate
  }
  throw new Error("Podman or Docker is required, and no running container engine was found")
}

function containerArchitecture(engine) {
  const requested = process.env.CONTAINER_ARCH?.trim()
  const detected =
    requested ??
    commandOutput(engine, engine === "podman" ? ["info", "--format", "{{.Host.Arch}}"] : ["info", "--format", "{{.Architecture}}"])
  const normalized = new Map([
    ["amd64", "amd64"],
    ["x86_64", "amd64"],
    ["x64", "amd64"],
    ["arm64", "arm64"],
    ["aarch64", "arm64"],
  ]).get(detected?.toLowerCase())
  if (!normalized) {
    throw new Error(`Unsupported container architecture: ${detected ?? "unknown"}. Set CONTAINER_ARCH to amd64 or arm64.`)
  }
  return normalized
}

const engine = selectContainerEngine()
const architecture = containerArchitecture(engine)

run(process.execPath, ["scripts/prepare.mjs"])
const lock = await readLock()
const baseImage = `trawlhalla-trawl-base:${lock.trawl.commit.slice(0, 12)}`
const finalImage = process.env.TRAWLHALLA_IMAGE ?? "trawlhalla:local"
const platformArgs = ["--platform", `linux/${architecture}`, "--build-arg", `TARGETARCH=${architecture}`]

console.log(`Building with ${engine} for linux/${architecture}`)
run(engine, [
  "build",
  ...platformArgs,
  "-f",
  ".build/trawl/apps/api/Dockerfile",
  "-t",
  baseImage,
  ".build/trawl",
])
run(engine, [
  "build",
  ...platformArgs,
  "--build-arg",
  `TRAWL_BASE_IMAGE=${baseImage}`,
  "--build-arg",
  `TRAWL_COMMIT=${lock.trawl.commit}`,
  "--build-arg",
  `BPC_COMMIT=${lock.bpc.commit}`,
  "--build-arg",
  `BPC_VERSION=${lock.bpc.version}`,
  "--build-arg",
  `BPC_SHA256=${lock.bpc.sha256}`,
  "-f",
  "integration/Dockerfile",
  "-t",
  finalImage,
  ".",
])
console.log(`Built ${finalImage}`)
