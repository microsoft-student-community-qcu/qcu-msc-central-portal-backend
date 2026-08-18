import { DefaultAzureCredential, ClientSecretCredential } from "@azure/identity";
import { BlobServiceClient } from "@azure/storage-blob";
import { env } from "../config/env";
import * as fs from "node:fs";
import * as path from "node:path";

let blobServiceClient: BlobServiceClient | null = null;

function getBlobServiceClient(): BlobServiceClient {
  if (!blobServiceClient) {
    const credential =
      env.AZURE_TENANT_ID && env.AZURE_CLIENT_ID && env.AZURE_CLIENT_SECRET
        ? new ClientSecretCredential(
            env.AZURE_TENANT_ID,
            env.AZURE_CLIENT_ID,
            env.AZURE_CLIENT_SECRET
          )
        : new DefaultAzureCredential();

    blobServiceClient = new BlobServiceClient(
      `https://${env.AZURE_STORAGE_ACCOUNT_NAME}.blob.core.windows.net`,
      credential
    );
  }
  return blobServiceClient;
}

const OCR_CONTAINER = "ocr";
const DOCUMENTS_CONTAINER = "documents";
const EVENT_BANNERS_CONTAINER = "event-banners";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");

// ── Local disk fallback: DEVELOPMENT ONLY ────────────────────────────────
//
// UNSAFE IN PRODUCTION / STAGING / RELEASE — do not enable it there, and do
// not add new code paths that call saveLocal outside development.
//
// The deployed backends are Azure Windows Function Apps running with
// WEBSITE_RUN_FROM_PACKAGE=1:
//   1. The package filesystem is read-only, so the write either throws or
//      lands somewhere that is wiped on the next restart/scale event.
//   2. Instances do not share a filesystem, so a file written by one
//      instance is invisible to the next request.
//   3. saveLocal returns a `http://localhost:<PORT>/uploads/...` URL. That
//      URL gets persisted into Applicant.idImagePath /
//      certificateOfRegistration / curriculumVitae and handed to the
//      browser, which then 404s. That turns a loud upload failure into
//      permanently corrupt database rows — strictly worse than failing.
//
// So outside development the Azure Blob error is rethrown and surfaces as a
// 5xx. A visible failure is the correct behaviour: the real fix is making
// the blob credential work (AZURE_CLIENT_ID of the user-assigned identity,
// or the service principal trio), not writing to local disk.
function isLocalFallbackAllowed(): boolean {
  return env.NODE_ENV === "development";
}

function handleStorageError(azureErr: unknown, operation: string): never {
  console.error(
    `[STORAGE] Azure Blob ${operation} failed in ${env.NODE_ENV}: ${(azureErr as Error).message}`
  );
  throw azureErr;
}

function ensureLocalDir(subDir: string): string {
  const dir = path.join(UPLOADS_DIR, subDir);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

async function saveLocal(subDir: string, filename: string, buffer: Buffer): Promise<string> {
  const dir = ensureLocalDir(subDir);
  const filePath = path.join(dir, filename);
  await fs.promises.writeFile(filePath, buffer);
  const port = env.PORT || 5000;
  return `http://localhost:${port}/uploads/${subDir}/${filename}`;
}

export async function saveImage(buffer: Buffer, filename: string, mimetype?: string): Promise<string> {
  try {
    const client = getBlobServiceClient();
    const containerClient = client.getContainerClient(OCR_CONTAINER);
    await containerClient.createIfNotExists();
    const blockBlobClient = containerClient.getBlockBlobClient(filename);
    await blockBlobClient.upload(buffer, buffer.length, {
      blobHTTPHeaders: mimetype ? { blobContentType: mimetype } : undefined,
    });
    return blockBlobClient.url;
  } catch (azureErr) {
    if (!isLocalFallbackAllowed()) {
      handleStorageError(azureErr, "image upload");
    }
    console.warn(`[STORAGE] Azure Blob upload failed (${(azureErr as Error).message}), falling back to local storage.`);
    return await saveLocal(OCR_CONTAINER, filename, buffer);
  }
}

export function getImagePath(filename: string): string {
  const localFile = path.join(UPLOADS_DIR, OCR_CONTAINER, filename);
  if (isLocalFallbackAllowed() && fs.existsSync(localFile)) {
    const port = env.PORT || 5000;
    return `http://localhost:${port}/uploads/${OCR_CONTAINER}/${filename}`;
  }
  return `https://${env.AZURE_STORAGE_ACCOUNT_NAME}.blob.core.windows.net/${OCR_CONTAINER}/${filename}`;
}

// ── Event Banner Storage (V2 Flow 1) ─────────────────────────────────────

/**
 * Uploads an event banner/poster and returns its public Blob URL.
 * Callers must validate the buffer with validateImageMimeType first.
 */
export async function saveEventBanner(
  buffer: Buffer,
  filename: string,
  mimetype?: string
): Promise<string> {
  try {
    const client = getBlobServiceClient();
    const containerClient = client.getContainerClient(EVENT_BANNERS_CONTAINER);
    await containerClient.createIfNotExists();
    const blockBlobClient = containerClient.getBlockBlobClient(filename);
    await blockBlobClient.upload(buffer, buffer.length, {
      blobHTTPHeaders: mimetype ? { blobContentType: mimetype } : undefined,
    });
    return blockBlobClient.url;
  } catch (azureErr) {
    if (!isLocalFallbackAllowed()) {
      handleStorageError(azureErr, "event banner upload");
    }
    console.warn(
      `[STORAGE] Azure Blob upload failed (${(azureErr as Error).message}), falling back to local storage.`
    );
    return await saveLocal(EVENT_BANNERS_CONTAINER, filename, buffer);
  }
}

// ── Document Storage (CoR, CV, etc.) ─────────────────────────────────────


export async function saveDocument(buffer: Buffer, filename: string, mimetype?: string): Promise<string> {
  try {
    const client = getBlobServiceClient();
    const containerClient = client.getContainerClient(DOCUMENTS_CONTAINER);
    await containerClient.createIfNotExists();
    const blockBlobClient = containerClient.getBlockBlobClient(filename);
    await blockBlobClient.upload(buffer, buffer.length, {
      blobHTTPHeaders: mimetype ? { blobContentType: mimetype } : undefined,
    });
    return blockBlobClient.url;
  } catch (azureErr) {
    if (!isLocalFallbackAllowed()) {
      handleStorageError(azureErr, "document upload");
    }
    console.warn(`[STORAGE] Azure Blob upload failed (${(azureErr as Error).message}), falling back to local storage.`);
    return await saveLocal(DOCUMENTS_CONTAINER, filename, buffer);
  }
}

export function getDocumentPath(filename: string): string {
  const localFile = path.join(UPLOADS_DIR, DOCUMENTS_CONTAINER, filename);
  if (isLocalFallbackAllowed() && fs.existsSync(localFile)) {
    const port = env.PORT || 5000;
    return `http://localhost:${port}/uploads/${DOCUMENTS_CONTAINER}/${filename}`;
  }
  return `https://${env.AZURE_STORAGE_ACCOUNT_NAME}.blob.core.windows.net/${DOCUMENTS_CONTAINER}/${filename}`;
}

export async function getDocumentStream(filename: string) {
  const localFile = path.join(UPLOADS_DIR, DOCUMENTS_CONTAINER, filename);
  if (isLocalFallbackAllowed() && fs.existsSync(localFile)) {
    const stat = await fs.promises.stat(localFile);
    return {
      stream: fs.createReadStream(localFile),
      contentType: undefined,
      contentLength: stat.size,
    };
  }
  const client = getBlobServiceClient();
  const containerClient = client.getContainerClient(DOCUMENTS_CONTAINER);
  const blockBlobClient = containerClient.getBlockBlobClient(filename);
  const downloadResponse = await blockBlobClient.download(0);
  return {
    stream: downloadResponse.readableStreamBody,
    contentType: downloadResponse.contentType,
    contentLength: downloadResponse.contentLength,
  };
}

export async function getImageStream(filename: string) {
  const localFile = path.join(UPLOADS_DIR, OCR_CONTAINER, filename);
  if (isLocalFallbackAllowed() && fs.existsSync(localFile)) {
    const stat = await fs.promises.stat(localFile);
    return {
      stream: fs.createReadStream(localFile),
      contentType: undefined,
      contentLength: stat.size,
    };
  }
  const client = getBlobServiceClient();
  const containerClient = client.getContainerClient(OCR_CONTAINER);
  const blockBlobClient = containerClient.getBlockBlobClient(filename);
  const downloadResponse = await blockBlobClient.download(0);
  return {
    stream: downloadResponse.readableStreamBody,
    contentType: downloadResponse.contentType,
    contentLength: downloadResponse.contentLength,
  };
}

