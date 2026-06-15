import express from "express";
import cors from "cors";
const app = express();

app.use(cors());
app.use(express.json());

// Base route
app.get("/", (_req, res) => {
  res.json({
    message: "QCU MSC Central Portal API is running."
  });
});

export default app;
