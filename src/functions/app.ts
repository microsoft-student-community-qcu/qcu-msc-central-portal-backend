import { app as azureApp } from "@azure/functions";
import expressApp from "../app";
import serverless from "serverless-http";

// Wrap Express with serverless-http
const handler = serverless(expressApp);

// Register the HTTP trigger under "express-api" routing all sub-paths
azureApp.http("express-api", {
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"],
  route: "{*segments}",
  handler: handler,
});
