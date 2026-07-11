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

export async function saveImage(buffer: Buffer, filename: string): Promise<string> {
  const client = getBlobServiceClient();
  const containerClient = client.getContainerClient(OCR_CONTAINER);
  await containerClient.createIfNotExists({ access: "container" });
  const blockBlobClient = containerClient.getBlockBlobClient(filename);
  await blockBlobClient.upload(buffer, buffer.length);
  return blockBlobClient.url;
}

export function getImagePath(filename: string): string {
  return `https://${env.AZURE_STORAGE_ACCOUNT_NAME}.blob.core.windows.net/${OCR_CONTAINER}/${filename}`;
}

// ── Document Storage (CoR, CV, etc.) ─────────────────────────────────────

export async function saveDocument(buffer: Buffer, filename: string): Promise<string> {
  const client = getBlobServiceClient();
  const containerClient = client.getContainerClient(DOCUMENTS_CONTAINER);
  await containerClient.createIfNotExists();
  const blockBlobClient = containerClient.getBlockBlobClient(filename);
  await blockBlobClient.upload(buffer, buffer.length);
  return blockBlobClient.url;
}

export function getDocumentPath(filename: string): string {
  return `https://${env.AZURE_STORAGE_ACCOUNT_NAME}.blob.core.windows.net/${DOCUMENTS_CONTAINER}/${filename}`;
}
