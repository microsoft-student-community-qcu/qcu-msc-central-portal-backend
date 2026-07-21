import { app as azureApp, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import expressApp from "../app";

let port: number = 0;
let serverPromise: Promise<number> | null = null;

function ensureServerStarted(): Promise<number> {
  if (port > 0) return Promise.resolve(port);
  if (serverPromise) return serverPromise;

  serverPromise = new Promise((resolve, reject) => {
    try {
      const server = expressApp.listen(0, "127.0.0.1", () => {
        const address = server.address();
        const p = typeof address === "string" ? 0 : address?.port || 0;
        if (p > 0) {
          port = p;
          console.log(`Express app listening internally on 127.0.0.1:${port}`);
          resolve(port);
        } else {
          reject(new Error("Failed to get port from server.address()"));
        }
      });
      server.on("error", (err) => {
        console.error("Express internal server error:", err);
        reject(err);
      });
    } catch (err) {
      reject(err);
    }
  });

  return serverPromise;
}

async function handleRequest(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const activePort = await ensureServerStarted();

    // Build the target URL for local proxy
    const url = new URL(request.url);
    let pathname = url.pathname;

    // Handle both Azure Functions default /api prefix and direct paths
    if (!pathname.startsWith('/api') && !pathname.startsWith('/health')) {
      pathname = `/api${pathname}`;
    }

    const localUrl = `http://127.0.0.1:${activePort}${pathname}${url.search}`;
    
    context.log(`Proxying request: ${request.method} ${url.pathname} -> ${localUrl}`);

    // Copy headers
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      if (lowerKey !== 'host' && lowerKey !== 'content-length' && lowerKey !== 'connection') {
        headers[key] = value;
      }
    });

    // Get body if present
    let body: any = undefined;
    if (request.body) {
      body = await request.text();
    }

    const response = await fetch(localUrl, {
      method: request.method,
      headers: headers,
      body: body,
      redirect: 'manual'
    });

    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    const responseBody = await response.text();

    return {
      status: response.status,
      headers: responseHeaders,
      body: responseBody
    };
  } catch (error: any) {
    context.error(`Error proxying to Express: ${error.message}\n${error.stack}`);
    return {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Internal Server Error", message: error.message, stack: error.stack })
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
