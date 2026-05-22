const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const { resolveNodeExecutable } = require("../src/cli");

test("resolveNodeExecutable prefers MYELINA_BUCKET_NODE_PATH", () => {
  const configuredPath = path.join(path.sep, "tools", "custom-node", process.platform === "win32" ? "node.exe" : "node");
  const result = resolveNodeExecutable({
    env: {
      MYELINA_BUCKET_NODE_PATH: configuredPath
    },
    execPath: path.join(path.sep, "runtime", "node", process.platform === "win32" ? "node.exe" : "node"),
    homeDir: path.join(path.sep, "home", "rodol"),
    exists: (candidate) => candidate === configuredPath
  });

  assert.equal(result, configuredPath);
});

test("resolveNodeExecutable falls back to bundled Codex node before process.execPath", () => {
  const homeDir = path.join(path.sep, "home", "rodol");
  const bundledPath = path.join(
    homeDir,
    ".cache",
    "codex-runtimes",
    "codex-primary-runtime",
    "dependencies",
    "node",
    "bin",
    process.platform === "win32" ? "node.exe" : "node"
  );
  const execPath = path.join(path.sep, "runtime", "node", process.platform === "win32" ? "node.exe" : "node");
  const result = resolveNodeExecutable({
    env: {},
    execPath,
    homeDir,
    exists: (candidate) => candidate === bundledPath
  });

  assert.equal(result, bundledPath);
});

test("resolveNodeExecutable falls back to process.execPath when no preferred candidate exists", () => {
  const execPath = path.join(path.sep, "runtime", "node", process.platform === "win32" ? "node.exe" : "node");
  const result = resolveNodeExecutable({
    env: {},
    execPath,
    homeDir: path.join(path.sep, "home", "rodol"),
    exists: () => false
  });

  assert.equal(result, execPath);
});
