const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const {
  DEFAULT_HOST,
  DEFAULT_PORT,
  LOGS_DIR,
  PID_FILE,
  STATE_FILE,
  ensureBaseStructure,
  randomToken,
  safeReadJson,
  writeJson
} = require("./utils");
const {
  assertProjectCredentials,
  createProject,
  getProjectByBucket,
  listObjects,
  listProjects,
  readObject,
  saveObject,
  deleteObject
} = require("./store");

function startServer(options = {}) {
  ensureBaseStructure();
  const host = options.host || DEFAULT_HOST;
  const port = Number(options.port || DEFAULT_PORT);
  const adminToken = options.adminToken || randomToken(18);

  const logFile = path.join(LOGS_DIR, "daemon.log");
  appendLog(logFile, `Starting myelinaBucket daemon on ${host}:${port}`);

  const server = http.createServer(async (req, res) => {
    try {
      await handleRequest(req, res, { host, port, adminToken, server, logFile });
    } catch (error) {
      const statusCode = error instanceof HttpError ? error.statusCode : 500;
      appendLog(logFile, `Request failed (${statusCode}): ${error.stack || error.message}`);
      sendJson(res, statusCode, { error: error.message || "Internal server error." });
    }
  });

  server.on("error", (error) => {
    appendLog(logFile, `Daemon failed: ${error.stack || error.message}`);
    safeUnlink(PID_FILE);
    safeUnlink(STATE_FILE);
    process.exitCode = 1;
    setImmediate(() => process.exit(1));
  });

  server.listen(port, host, () => {
    const address = server.address();
    const activePort = typeof address === "object" && address ? address.port : port;
    fs.writeFileSync(PID_FILE, String(process.pid));
    writeJson(STATE_FILE, {
      pid: process.pid,
      host,
      port: activePort,
      adminToken,
      startedAt: new Date().toISOString()
    });
    appendLog(logFile, `Daemon ready with pid ${process.pid} on ${host}:${activePort}`);
  });

  const shutdown = () => {
    appendLog(logFile, `Stopping daemon pid ${process.pid}`);
    server.close(() => {
      safeUnlink(PID_FILE);
      safeUnlink(STATE_FILE);
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  return { server, adminToken, host, port };
}

async function handleRequest(req, res, context) {
  const url = new URL(req.url, `http://${req.headers.host || `${context.host}:${context.port}`}`);
  const pathname = url.pathname;

  if (req.method === "GET" && pathname === "/health") {
    return sendJson(res, 200, {
      name: "myelinaBucket",
      status: "ok",
      pid: process.pid,
      host: context.host,
      port: context.port,
      projects: listProjects().length
    });
  }

  if (req.method === "POST" && pathname === "/admin/projects") {
    assertAdmin(req, context.adminToken);
    const body = await readJsonBody(req);
    const project = createProject(body.name, {
      endpoint: `http://${context.host}:${context.port}`
    });
    return sendJson(res, 201, project);
  }

  if (req.method === "GET" && pathname === "/admin/projects") {
    assertAdmin(req, context.adminToken);
    return sendJson(res, 200, { projects: listProjects() });
  }

  if (req.method === "POST" && pathname === "/admin/shutdown") {
    assertAdmin(req, context.adminToken);
    sendJson(res, 200, { message: "Daemon stopping." });
    setTimeout(() => {
      context.server.close(() => {
        safeUnlink(PID_FILE);
        safeUnlink(STATE_FILE);
        process.exit(0);
      });
    }, 50);
    return;
  }

  const bucketMatch = pathname.match(/^\/b\/([^/]+)$/);
  if (req.method === "GET" && bucketMatch) {
    const bucketName = decodeURIComponent(bucketMatch[1]);
    const project = authenticateProjectRequest(req, bucketName);
    return sendJson(res, 200, {
      bucket: bucketName,
      objects: listObjects(project.id, url.searchParams.get("prefix") || "")
    });
  }

  const objectMatch = pathname.match(/^\/b\/([^/]+)\/(.+)$/);
  if (!objectMatch) {
    return sendJson(res, 404, { error: "Route not found." });
  }

  const bucketName = decodeURIComponent(objectMatch[1]);
  const objectPath = decodeURIComponent(objectMatch[2]);
  const project = authenticateProjectRequest(req, bucketName);

  if (req.method === "PUT") {
    const buffer = await readBufferBody(req);
    const saved = saveObject(project.id, objectPath, buffer);
    return sendJson(res, 201, {
      bucket: bucketName,
      ...saved
    });
  }

  if (req.method === "GET") {
    const file = readObject(project.id, objectPath);
    if (!file) {
      return sendJson(res, 404, { error: "Object not found." });
    }
    res.writeHead(200, {
      "content-length": file.size,
      "content-type": "application/octet-stream"
    });
    file.stream.pipe(res);
    return;
  }

  if (req.method === "DELETE") {
    const deleted = deleteObject(project.id, objectPath);
    if (!deleted) {
      return sendJson(res, 404, { error: "Object not found." });
    }
    return sendJson(res, 200, { deleted });
  }

  return sendJson(res, 405, { error: "Method not allowed." });
}

function authenticateProjectRequest(req, bucketName) {
  const accessKey = req.headers["x-access-key"];
  const secretKey = req.headers["x-secret-key"];
  if (!accessKey || !secretKey) {
    throw new HttpError(401, "Missing bucket credentials.");
  }
  return assertProjectCredentials(bucketName, String(accessKey), String(secretKey));
}

function assertAdmin(req, adminToken) {
  const token = req.headers["x-admin-token"];
  if (token !== adminToken) {
    throw new HttpError(401, "Invalid admin token.");
  }
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body)
  });
  res.end(body);
}

function readBufferBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function readJsonBody(req) {
  const buffer = await readBufferBody(req);
  if (!buffer.length) {
    return {};
  }
  return JSON.parse(buffer.toString("utf8"));
}

function appendLog(logFile, message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  fs.appendFileSync(logFile, line);
}

function safeUnlink(filePath) {
  try {
    fs.rmSync(filePath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function runServerFromCli() {
  const state = safeReadJson(STATE_FILE, {});
  const host = process.env.MYELINA_BUCKET_HOST || state.host || DEFAULT_HOST;
  const port = Number(process.env.MYELINA_BUCKET_PORT || state.port || DEFAULT_PORT);
  const adminToken = process.env.MYELINA_BUCKET_ADMIN_TOKEN || state.adminToken;

  const { server } = startServer({ host, port, adminToken });
  server.on("clientError", (error, socket) => {
    socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
    appendLog(path.join(LOGS_DIR, "daemon.log"), `Client error: ${error.message}`);
  });
}

module.exports = {
  HttpError,
  startServer,
  runServerFromCli
};

if (require.main === module) {
  runServerFromCli();
}
