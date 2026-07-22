import { app as azureApp, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import serverless from "serverless-http";
import expressApp from "../app";

// Bridge Express to Azure Functions v4 using serverless-http.
//
// Why not a hand-rolled Readable/Writable adapter: Express's `init` middleware
// reassigns req.__proto__ = app.request and res.__proto__ = app.response, whose
// prototype chains are Node's http.IncomingMessage / http.ServerResponse. Those
// built-in methods require real socket internals — e.g. req.protocol reads
// req.socket.encrypted, res.end() pushes into res.outputData. Fake stream stubs
// don't have them, so any request throws asynchronously (uncaughtException) and
// the worker returns an empty-body 500.
//
// serverless-http's ServerlessRequest extends http.IncomingMessage (with a socket
// stub exposing `encrypted`) and ServerlessResponse extends http.ServerResponse,
// so Express, cors, and the Sentry error handler all run against real objects.
const serverlessHandler = serverless(expressApp, {
  provider: "azure",
  // Content types returned as base64 by the azure provider (decoded to Buffer below).
  binary: ["image/*", "application/pdf", "application/octet-stream", "application/zip"],
});

async function handleRequest(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const url = new URL(request.url);

  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });

  const query: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    query[key] = value;
  });

  const rawBody = request.body ? Buffer.from(await request.arrayBuffer()) : Buffer.alloc(0);

  // serverless-http's azure provider expects the v3-style (context, req) shape.
  // It reads: method, url (pathname), headers, query, rawBody. Query is merged
  // back onto the URL internally, so pass pathname only here to avoid duplication.
  const azureReq = {
    method: request.method,
    url: url.pathname,
    headers,
    query,
    rawBody,
  };

  const result: any = await serverlessHandler(context as any, azureReq as any);

  return {
    status: result.status,
    headers: result.headers,
    body: result.isBase64Encoded ? Buffer.from(result.body, "base64") : result.body,
  };
}

// Register the HTTP trigger under "express-api" routing all sub-paths.
azureApp.http("express-api", {
  authLevel: "anonymous",
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"],
  route: "{*segments}",
  handler: handleRequest,
});
