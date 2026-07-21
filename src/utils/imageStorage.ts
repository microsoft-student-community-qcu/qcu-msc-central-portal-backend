import { DefaultAzureCredential } from "@azure/identity";
import { BlobServiceClient } from "@azure/storage-blob";
import { env } from "../config/env";

let blobServiceClient: BlobServiceClient | null = null;

function getBlobServiceClient(): BlobServiceClient {
  if (!blobServiceClient) {
    const credential = new DefaultAzureCredential();
    blobServiceClient = new BlobServiceClient(
      `https://${env.AZURE_STORAGE_ACCOUNT_NAME}.blob.core.windows.net`,
      credential
    );
  }
  return blobServiceClient;
}

const OCR_CONTAINER = "ocr";
const DOCUMENTS_CONTAINER = "documents";

export async function saveImage(buffer: Buffer, filename: string, mimetype?: string): Promise<string> {
  const client = getBlobServiceClient();
  const containerClient = client.getContainerClient(OCR_CONTAINER);
  await containerClient.createIfNotExists();
  const blockBlobClient = containerClient.getBlockBlobClient(filename);
  await blockBlobClient.upload(buffer, buffer.length, {
    blobHTTPHeaders: mimetype ? { blobContentType: mimetype } : undefined,
  });
  return blockBlobClient.url;
}

export function getImagePath(filename: string): string {
  return `https://${env.AZURE_STORAGE_ACCOUNT_NAME}.blob.core.windows.net/${OCR_CONTAINER}/${filename}`;
}

// ── Document Storage (CoR, CV, etc.) ─────────────────────────────────────

export async function saveDocument(buffer: Buffer, filename: string, mimetype?: string): Promise<string> {
  const client = getBlobServiceClient();
  const containerClient = client.getContainerClient(DOCUMENTS_CONTAINER);
  await containerClient.createIfNotExists();
  const blockBlobClient = containerClient.getBlockBlobClient(filename);
  await blockBlobClient.upload(buffer, buffer.length, {
    blobHTTPHeaders: mimetype ? { blobContentType: mimetype } : undefined,
  });
  return blockBlobClient.url;
}

export function getDocumentPath(filename: string): string {
  return `https://${env.AZURE_STORAGE_ACCOUNT_NAME}.blob.core.windows.net/${DOCUMENTS_CONTAINER}/${filename}`;
}

export async function getDocumentStream(filename: string) {
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
