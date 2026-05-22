const fs = require("node:fs");
const path = require("node:path");

const {
  DEFAULT_HOST,
  DEFAULT_PORT,
  PROJECTS_FILE,
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
} = require("./utils");

function loadRegistry() {
  ensureBaseStructure();
  return safeReadJson(PROJECTS_FILE, { projects: [] });
}

function saveRegistry(registry) {
  writeJson(PROJECTS_FILE, registry);
}

function listProjects() {
  return loadRegistry().projects;
}

function getProjectById(projectId) {
  return listProjects().find((project) => project.id === projectId) || null;
}

function getProjectByBucket(bucketName) {
  return listProjects().find((project) => project.bucketName === bucketName) || null;
}

function getProjectByAccessKey(accessKey) {
  return listProjects().find((project) => project.accessKey === accessKey) || null;
}

function createProject(name, options = {}) {
  const registry = loadRegistry();
  const id = slugifyProjectName(name);
  if (!id) {
    throw new Error("Project name must contain letters or numbers.");
  }
  if (registry.projects.some((project) => project.id === id)) {
    throw new Error(`Project "${id}" already exists.`);
  }

  const project = {
    id,
    name,
    bucketName: options.bucketName || `${id}-bucket`,
    accessKey: `mb_${randomToken(8)}`,
    secretKey: `ms_${randomToken(16)}`,
    endpoint: options.endpoint || `http://${DEFAULT_HOST}:${DEFAULT_PORT}`,
    createdAt: new Date().toISOString()
  };

  ensureDir(projectRoot(id));
  ensureDir(objectsRoot(id));
  writeJson(metadataFile(id), project);
  registry.projects.push(project);
  saveRegistry(registry);

  return project;
}

function assertProjectCredentials(bucketName, accessKey, secretKey) {
  const project = getProjectByBucket(bucketName);
  if (!project) {
    throw new Error("Bucket not found.");
  }
  if (project.accessKey !== accessKey || project.secretKey !== secretKey) {
    throw new Error("Invalid project credentials.");
  }
  return project;
}

function saveObject(projectId, objectPath, bodyBuffer) {
  const { normalized, fullPath } = resolveObjectPath(projectId, objectPath);
  ensureDir(path.dirname(fullPath));
  fs.writeFileSync(fullPath, bodyBuffer);
  const stats = fs.statSync(fullPath);
  return {
    path: normalized,
    size: stats.size,
    updatedAt: stats.mtime.toISOString()
  };
}

function readObject(projectId, objectPath) {
  const { normalized, fullPath } = resolveObjectPath(projectId, objectPath);
  if (!fs.existsSync(fullPath)) {
    return null;
  }
  const stats = fs.statSync(fullPath);
  return {
    path: normalized,
    size: stats.size,
    updatedAt: stats.mtime.toISOString(),
    stream: fs.createReadStream(fullPath)
  };
}

function deleteObject(projectId, objectPath) {
  const { normalized, fullPath } = resolveObjectPath(projectId, objectPath);
  if (!fs.existsSync(fullPath)) {
    return false;
  }
  fs.rmSync(fullPath);
  return normalized;
}

function listObjects(projectId, prefix = "") {
  const root = objectsRoot(projectId);
  const normalizedPrefix = prefix ? prefix.replace(/\\/g, "/").replace(/^\/+/, "") : "";
  if (!fs.existsSync(root)) {
    return [];
  }
  const found = [];
  walkObjects(root, root, found);
  return found
    .filter((entry) => entry.path.startsWith(normalizedPrefix))
    .sort((left, right) => left.path.localeCompare(right.path));
}

function walkObjects(currentPath, basePath, found) {
  const entries = fs.readdirSync(currentPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(currentPath, entry.name);
    if (entry.isDirectory()) {
      walkObjects(fullPath, basePath, found);
      continue;
    }
    const stats = fs.statSync(fullPath);
    found.push({
      path: path.relative(basePath, fullPath).replace(/\\/g, "/"),
      size: stats.size,
      updatedAt: stats.mtime.toISOString()
    });
  }
}

module.exports = {
  assertProjectCredentials,
  createProject,
  getProjectByAccessKey,
  getProjectByBucket,
  getProjectById,
  listObjects,
  listProjects,
  readObject,
  saveObject,
  deleteObject
};

