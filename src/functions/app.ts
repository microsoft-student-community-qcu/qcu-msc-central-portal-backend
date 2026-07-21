import { app as azureApp, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { Readable, Writable } from "stream";
import expressApp from "../app";

async function handleRequest(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  return new Promise<HttpResponseInit>(async (resolve) => {
    try {
      const url = new URL(request.url);
      
      // Parse body if present
      let bodyBuffer: Buffer = Buffer.alloc(0);
      if (request.body) {
        const arrayBuffer = await request.arrayBuffer();
        bodyBuffer = Buffer.from(arrayBuffer);
      }

      // Convert request headers
      const headers: Record<string, string | string[]> = {};
      request.headers.forEach((value, key) => {
        headers[key.toLowerCase()] = value;
      });

      const reqStream: any = new Readable({
        read() {}
      });
      reqStream.push(bodyBuffer);
      reqStream.push(null);

      reqStream.method = request.method;
      reqStream.url = url.pathname + url.search;
      reqStream.originalUrl = url.pathname + url.search;
      reqStream.headers = headers;
      reqStream.rawHeaders = Object.entries(headers).flatMap(([k, v]) => [k, Array.isArray(v) ? v.join(", ") : v]);

      const resHeaders: Record<string, string> = {};
      const chunks: Buffer[] = [];
      let statusCode = 200;

      const resStream: any = new Writable({
        write(chunk, encoding, callback) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
          callback();
        }
      });

      resStream.setHeader = (name: string, value: any) => {
        resHeaders[name.toLowerCase()] = String(value);
      };
      resStream.getHeader = (name: string) => resHeaders[name.toLowerCase()];
      resStream.removeHeader = (name: string) => delete resHeaders[name.toLowerCase()];
      resStream.writeHead = (code: number, headersObj?: any) => {
        statusCode = code;
        if (headersObj) {
          Object.entries(headersObj).forEach(([k, v]) => {
            resHeaders[k.toLowerCase()] = String(v);
          });
        }
      };

      resStream.on("finish", () => {
        const bodyText = Buffer.concat(chunks).toString("utf-8");
        resolve({
          status: statusCode,
          headers: resHeaders,
          body: bodyText
        });
      });

      expressApp(reqStream, resStream);
    } catch (err: any) {
      context.error("Error in Azure Function Express bridge:", err);
      resolve({
        status: 500,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "Internal Server Error", message: err.message })
      });
    }
  });
}

// Register the HTTP trigger under "express-api" routing all sub-paths
azureApp.http("express-api", {
  authLevel: "anonymous",
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"],
  route: "{*segments}",
  handler: handleRequest,
});
