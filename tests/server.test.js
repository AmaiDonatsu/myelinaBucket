const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { once } = require("node:events");

test("server can create a project and store an object", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "myelina-bucket-test-"));
  process.env.MYELINA_BUCKET_ROOT_DIR = tempRoot;

  delete require.cache[require.resolve("../src/server")];
  delete require.cache[require.resolve("../src/store")];
  delete require.cache[require.resolve("../src/utils")];
  const { startServer } = require("../src/server");

  const { server } = startServer({
    host: "127.0.0.1",
    port: 0,
    adminToken: "test-admin-token"
  });

  await once(server, "listening");
  const address = server.address();
  const endpoint = `http://127.0.0.1:${address.port}`;

  const createResponse = await fetch(`${endpoint}/admin/projects`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-admin-token": "test-admin-token"
    },
    body: JSON.stringify({ name: `Test Media App ${Date.now()}` })
  });
  assert.equal(createResponse.status, 201);
  const project = await createResponse.json();

  const payload = Buffer.from("hello media", "utf8");
  const uploadResponse = await fetch(`${endpoint}/b/${project.bucketName}/media/hello.txt`, {
    method: "PUT",
    headers: {
      "x-access-key": project.accessKey,
      "x-secret-key": project.secretKey
    },
    body: payload
  });
  assert.equal(uploadResponse.status, 201);

  const listResponse = await fetch(`${endpoint}/b/${project.bucketName}?prefix=media/`, {
    headers: {
      "x-access-key": project.accessKey,
      "x-secret-key": project.secretKey
    }
  });
  assert.equal(listResponse.status, 200);
  const listed = await listResponse.json();
  assert.equal(listed.objects.length, 1);
  assert.equal(listed.objects[0].path, "media/hello.txt");

  const readResponse = await fetch(`${endpoint}/b/${project.bucketName}/media/hello.txt`, {
    headers: {
      "x-access-key": project.accessKey,
      "x-secret-key": project.secretKey
    }
  });
  assert.equal(readResponse.status, 200);
  assert.equal(await readResponse.text(), "hello media");

  const deleteResponse = await fetch(`${endpoint}/b/${project.bucketName}/media/hello.txt`, {
    method: "DELETE",
    headers: {
      "x-access-key": project.accessKey,
      "x-secret-key": project.secretKey
    }
  });
  assert.equal(deleteResponse.status, 200);

  await new Promise((resolve) => server.close(resolve));
  delete process.env.MYELINA_BUCKET_ROOT_DIR;
  fs.rmSync(tempRoot, { recursive: true, force: true });
});
