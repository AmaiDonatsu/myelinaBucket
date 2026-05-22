const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = process.env.MYELINA_BUCKET_ROOT_DIR
  ? path.resolve(process.env.MYELINA_BUCKET_ROOT_DIR)
  : path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT_DIR, "data");
const PROJECTS_DIR = path.join(DATA_DIR, "projects");
const SYSTEM_DIR = path.join(DATA_DIR, "system");
const RUNTIME_DIR = path.join(ROOT_DIR, "runtime");
const LOGS_DIR = path.join(ROOT_DIR, "logs");
const PID_FILE = path.join(RUNTIME_DIR, "daemon.pid");
const STATE_FILE = path.join(RUNTIME_DIR, "daemon-state.json");
const PROJECTS_FILE = path.join(SYSTEM_DIR, "projects.json");
const DEFAULT_PORT = 4040;
const DEFAULT_HOST = "127.0.0.1";

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function ensureBaseStructure() {
  ensureDir(DATA_DIR);
  ensureDir(PROJECTS_DIR);
  ensureDir(SYSTEM_DIR);
  ensureDir(RUNTIME_DIR);
  ensureDir(LOGS_DIR);
}

function safeReadJson(filePath, fallback) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    return fallback;
  }
}

function writeJson(filePath, payload) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
}

function randomToken(size = 24) {
  return crypto.randomBytes(size).toString("hex");
}

function slugifyProjectName(name) {
  return String(name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function projectRoot(projectId) {
  return path.join(PROJECTS_DIR, projectId);
}

function objectsRoot(projectId) {
  return path.join(projectRoot(projectId), "objects");
}

function metadataFile(projectId) {
  return path.join(projectRoot(projectId), "project.json");
}

function normalizeObjectPath(objectPath) {
  const rawPath = String(objectPath || "").replace(/\\/g, "/").trim();
  const trimmed = rawPath.replace(/^\/+/, "");
  if (!trimmed) {
    throw new Error("Object path is required.");
  }
  const segments = trimmed.split("/");
  for (const segment of segments) {
    if (!segment || segment === "." || segment === "..") {
      throw new Error("Invalid object path.");
    }
  }
  return segments.join("/");
}

function resolveObjectPath(projectId, objectPath) {
  const normalized = normalizeObjectPath(objectPath);
  const fullPath = path.join(objectsRoot(projectId), ...normalized.split("/"));
  const basePath = objectsRoot(projectId);
  const relative = path.relative(basePath, fullPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Object path escapes project directory.");
  }
  return { normalized, fullPath };
}

module.exports = {
  DEFAULT_HOST,
  DEFAULT_PORT,
  DATA_DIR,
  LOGS_DIR,
  PID_FILE,
  PROJECTS_DIR,
  PROJECTS_FILE,
  ROOT_DIR,
  RUNTIME_DIR,
  STATE_FILE,
  ensureBaseStructure,
  ensureDir,
  metadataFile,
  objectsRoot,
  projectRoot,
  randomToken,
  resolveObjectPath,
  safeReadJson,
  slugifyProjectName,
  writeJson
};
