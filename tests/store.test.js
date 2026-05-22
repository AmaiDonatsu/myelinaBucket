const test = require("node:test");
const assert = require("node:assert/strict");

const { slugifyProjectName } = require("../src/utils");

test("slugify project names", () => {
  assert.equal(slugifyProjectName("Mi Proyecto 01"), "mi-proyecto-01");
  assert.equal(slugifyProjectName(" app_media "), "app_media");
});
