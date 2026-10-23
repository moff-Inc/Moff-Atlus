import { readFile, writeFile } from "node:fs/promises";

async function readJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

const [releases, next, eslint, types] = await Promise.all([
  readJson("https://nodejs.org/dist/index.json"),
  readJson("https://registry.npmjs.org/next/latest"),
  readJson("https://registry.npmjs.org/eslint-config-next/latest"),
  readJson("https://registry.npmjs.org/@types%2fnode"),
]);
const stableVersion = /^\d+\.\d+\.\d+$/;
const node = releases.find(({ version }) => stableVersion.test(version.slice(1)));
if (!node || !stableVersion.test(next.version) || next.version !== eslint.version) {
  throw new Error("Stable Node.js and matching Next.js/ESLint releases are required.");
}
const nodeVersion = node.version.slice(1);
const major = Number(nodeVersion.split(".")[0]);
const nodeTypes = Object.keys(types.versions)
  .filter((version) => stableVersion.test(version) && version.startsWith(`${major}.`))
  .sort((a, b) => a.localeCompare(b, "en", { numeric: true }))
  .at(-1);
if (!nodeTypes) throw new Error(`No stable @types/node release for Node.js ${major}.`);

const manifest = JSON.parse(await readFile("package.json", "utf8"));
manifest.engines = { ...manifest.engines, node: `>=${nodeVersion} <${major + 1}` };
manifest.dependencies.next = next.version;
manifest.devDependencies["eslint-config-next"] = next.version;
manifest.devDependencies["@types/node"] = nodeTypes;
await writeFile("package.json", `${JSON.stringify(manifest, null, 2)}\n`);
await writeFile(".node-version", `${nodeVersion}\n`);
console.log(`Node.js ${nodeVersion}; Next.js ${next.version}; @types/node ${nodeTypes}`);
