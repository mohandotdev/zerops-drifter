// @ts-nocheck
// @ts-nocheck
import assert from "node:assert/strict";
import test from "node:test";

import { fetchProjects } from "./parity-api.js";

test("fetchProjects parses a backend project list payload", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => {
    return new Response(
      JSON.stringify({
        list: [{ id: "staging-id", name: "zerops-drift-staging", environment: "staging" }],
        totalCount: 1,
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  };

  try {
    const projects = await fetchProjects();
    assert.equal(projects.length, 1);
    assert.equal(projects[0]?.id, "staging-id");
    assert.equal(projects[0]?.name, "zerops-drift-staging");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
