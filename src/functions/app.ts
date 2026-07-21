import { app as azureApp, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import expressApp from "../app";
import serverless from "serverless-http";

const serverlessHandler = serverless(expressApp);

async function handleRequest(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  try {
    return (await serverlessHandler(request as any, context as any)) as HttpResponseInit;
  } catch (error: any) {
    context.error(`Error in serverless handler: ${error.message}\n${error.stack}`);
    return {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Internal Server Error", message: error.message }),
    };
  }
}

// Register the HTTP trigger under "express-api" routing all sub-paths
azureApp.http("express-api", {
  authLevel: "anonymous",
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"],
  route: "{*segments}",
  handler: handleRequest,
});
