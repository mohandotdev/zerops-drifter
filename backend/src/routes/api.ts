import { Router } from "express";
import { ZeropsClient } from "../zerops/client.js";
import { collectSnapshot } from "../snapshot/collector.js";
import { compareSnapshots } from "../diff/engine.js";

const router = Router();

function client() {
  const token = process.env.PLATFORM_API_TOKEN;
  const base = process.env.PLATFORM_API_URL;

  if (!token || !base) {
    throw new Error("PLATFORM_API_TOKEN and PLATFORM_API_URL must be configured.");
  }

  return new ZeropsClient(base, token);
}

router.get("/health", (_req, res) => {
  res.json({ ok: true, service: "zerops-parity-radar" });
});

router.get("/projects", async (_req, res) => {
  try {
    const result = await client().getProjects(process.env.PLATFORM_CLIENT_ID!);
    res.json(result);
  } catch (error) {
    res.status(502).json({ error: (error as Error).message });
  }
});

router.get("/snapshot/:projectId", async (req, res) => {
  try {
    const snapshot = await collectSnapshot(client(), req.params.projectId);
    res.json(snapshot);
  } catch (error) {
    res.status(502).json({ error: (error as Error).message });
  }
});

router.get("/compare", async (req, res) => {
  const stagingId = String(req.query.stagingId || "");
  const productionId = String(req.query.productionId || "");

  if (!stagingId || !productionId) {
    return res.status(400).json({
      error: "stagingId and productionId are required."
    });
  }

  if (stagingId === productionId) {
    return res.status(400).json({
      error: "Choose two different projects."
    });
  }

  try {
    const z = client();

    const [staging, production] = await Promise.all([
      collectSnapshot(z, stagingId),
      collectSnapshot(z, productionId)
    ]);

    res.json(compareSnapshots(staging, production));
  } catch (error) {
    res.status(502).json({ error: (error as Error).message });
  }
});

export default router;
