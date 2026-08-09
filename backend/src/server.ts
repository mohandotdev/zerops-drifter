import "dotenv/config";
import express from "express";
import cors from "cors";
import api from "./routes/api.js";

const app = express();
const port = Number(process.env.PORT || 3001);

app.use(cors({ origin: process.env.CORS_ORIGIN || true }));
app.use(express.json());

app.use("/api", api);

app.listen(port, () => {
  console.log(`Parity Radar API listening on :${port}`);
});
