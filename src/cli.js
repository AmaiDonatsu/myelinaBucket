#!/usr/bin/env node
const fs = require("node:fs");
const { spawn } = require("node:child_process");
const os = require("node:os");
const path = require("node:path");

const { runServerFromCli } = require("./server");
const {
  DEFAULT_HOST,
  DEFAULT_PORT,
  LOGS_DIR,
  ROOT_DIR,
  STATE_FILE,
  ensureBaseStructure,
  safeReadJson,
  writeJson
} = require("./utils");

async function main() {
  ensureBaseStructure();
  const [command, ...args] = process.argv.slice(2);

  switch (command) {
    case "serve":
      runServerFromCli();
      return;
    case "start":
      return startDaemon(args);
    case "stop":
      return stopDaemon();
    case "status":
      return showStatus();
    case "create-project":
      return createProjectCommand(args);
    case "list-projects":
      return listProjectsCommand();
    case "help":
    case undefined:
      return printHelp();
    default:
      throw new Error(`Unknown command "${command}".`);
  }
}

async function startDaemon(args) {
  const desiredPort = Number(args[0] || DEFAULT_PORT);
  if (!Number.isInteger(desiredPort) || desiredPort < 1 || desiredPort > 65535) {
    throw new Error("Port must be an integer between 1 and 65535.");
  }

  const state = safeReadJson(STATE_FILE, {});

  if (state.pid && isPidRunning(state.pid)) {
    console.log(`myelinaBucket is already running on ${state.host}:${state.port} (pid ${state.pid}).`);
    return;
  }

  const host = DEFAULT_HOST;
  const port = desiredPort;
  const adminToken = state.adminToken || randomAdminToken();

  writeJson(STATE_FILE, {
    ...state,
    host,
    port,
    adminToken
  });

  const child = spawn(resolveNodeExecutable(), [path.join(ROOT_DIR, "src", "cli.js"), "serve"], {
    cwd: ROOT_DIR,
    detached: true,
    stdio: "ignore",
    windowsHide: true,
    env: {
      ...process.env,
      MYELINA_BUCKET_HOST: host,
      MYELINA_BUCKET_PORT: String(port),
      MYELINA_BUCKET_ADMIN_TOKEN: adminToken
    }
  });

  try {
    const health = await waitForDaemonStartup({ child, host, port });
    child.unref();
    console.log(`myelinaBucket running on http://${host}:${port} (pid ${health.pid}).`);
  } catch (error) {
    child.unref();
    throw error;
  }
}

async function stopDaemon() {
  const state = safeReadJson(STATE_FILE, {});
  if (!state.adminToken || !state.port) {
    console.log("myelinaBucket is not running.");
    return;
  }
  try {
    const response = await fetch(`http://${state.host}:${state.port}/admin/shutdown`, {
      method: "POST",
      headers: {
        "x-admin-token": state.adminToken
      }
    });
    if (!response.ok) {
      throw new Error(`Shutdown failed with status ${response.status}.`);
    }
    console.log("myelinaBucket stopped.");
  } catch (error) {
    if (state.pid && isPidRunning(state.pid)) {
      process.kill(state.pid, "SIGTERM");
      console.log("myelinaBucket stop signal sent.");
      return;
    }
    console.log("myelinaBucket is not running.");
  }
}

async function showStatus() {
  const state = safeReadJson(STATE_FILE, {});
  if (!state.port) {
    console.log("Status: stopped");
    return;
  }
  try {
    const response = await fetch(`http://${state.host}:${state.port}/health`);
    if (!response.ok) {
      throw new Error(`Health check failed with status ${response.status}.`);
    }
    const health = await response.json();
    console.log(JSON.stringify(health, null, 2));
  } catch (error) {
    const payload = {
      status: "stopped",
      pid: state.pid && isPidRunning(state.pid) ? state.pid : null
    };
    console.log(JSON.stringify(payload, null, 2));
  }
}

async function createProjectCommand(args) {
  const name = args.join(" ").trim();
  if (!name) {
    throw new Error("Project name is required.");
  }
  const state = safeReadJson(STATE_FILE, {});
  if (!state.adminToken || !state.port) {
    throw new Error("Start the daemon before creating a project.");
  }

  const response = await fetch(`http://${state.host}:${state.port}/admin/projects`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-admin-token": state.adminToken
    },
    body: JSON.stringify({ name })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Project creation failed: ${errorText}`);
  }

  const project = await response.json();
  console.log(JSON.stringify({
    project: project.name,
    projectId: project.id,
    bucketName: project.bucketName,
    endpoint: project.endpoint,
    accessKey: project.accessKey,
    secretKey: project.secretKey,
    uploadExample: `PUT ${project.endpoint}/b/${project.bucketName}/media/example.jpg`,
    listObjectsExample: `GET ${project.endpoint}/b/${project.bucketName}?prefix=media/`
  }, null, 2));
}

async function listProjectsCommand() {
  const state = safeReadJson(STATE_FILE, {});
  if (!state.adminToken || !state.port) {
    throw new Error("Start the daemon before listing projects.");
  }
  const response = await fetch(`http://${state.host}:${state.port}/admin/projects`, {
    headers: {
      "x-admin-token": state.adminToken
    }
  });
  if (!response.ok) {
    throw new Error(`List projects failed with status ${response.status}.`);
  }
  const payload = await response.json();
  console.log(JSON.stringify(payload, null, 2));
}

function printHelp() {
  console.log([
    "myelinaBucket commands:",
    "  start [port]          Start the daemon in background",
    "  stop                  Stop the daemon from any terminal",
    "  status                Show daemon health",
    "  create-project NAME   Create a new local bucket project",
    "  list-projects         List all configured projects",
    "  serve                 Internal command used by the daemon"
  ].join("\n"));
}

function isPidRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return false;
  }
}

function resolveNodeExecutable(options = {}) {
  const env = options.env || process.env;
  const execPath = options.execPath || process.execPath;
  const exists = options.exists || fs.existsSync;
  const homeDir = options.homeDir || os.homedir();
  const candidates = [
    env.MYELINA_BUCKET_NODE_PATH,
    path.join(homeDir, ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "node", "bin", process.platform === "win32" ? "node.exe" : "node"),
    execPath
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      if (exists(candidate)) {
        return candidate;
      }
    } catch (error) {
      continue;
    }
  }

  return execPath;
}

async function waitForDaemonStartup({ child, host, port, timeoutMs = 5000 }) {
  let spawnError = null;
  let exitInfo = null;
  const healthUrl = `http://${host}:${port}/health`;
  const deadline = Date.now() + timeoutMs;

  child.once("error", (error) => {
    spawnError = error;
  });
  child.once("exit", (code, signal) => {
    exitInfo = { code, signal };
  });

  while (Date.now() < deadline) {
    if (spawnError) {
      throw new Error(`Daemon failed to start: ${spawnError.message}.${readDaemonLogHint()}`);
    }

    if (exitInfo) {
      const reason = exitInfo.signal ? `signal ${exitInfo.signal}` : `code ${exitInfo.code}`;
      throw new Error(`Daemon exited before becoming ready (${reason}).${readDaemonLogHint()}`);
    }

    try {
      const response = await fetch(healthUrl);
      if (response.ok) {
        return response.json();
      }
    } catch (error) {
      // Keep polling until the daemon is ready or the timeout expires.
    }

    await delay(200);
  }

  throw new Error(`Daemon did not become ready on ${healthUrl} within ${timeoutMs}ms.${readDaemonLogHint()}`);
}

function readDaemonLogHint() {
  const logFile = path.join(LOGS_DIR, "daemon.log");
  try {
    const content = fs.readFileSync(logFile, "utf8").trim();
    if (!content) {
      return ` Check ${logFile} for details.`;
    }
    const lines = content.split(/\r?\n/).filter(Boolean);
    const lastLine = lines[lines.length - 1];
    return ` Last log: ${lastLine}`;
  } catch (error) {
    return "";
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomAdminToken() {
  return `adm_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

module.exports = {
  main,
  resolveNodeExecutable,
  startDaemon
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}
