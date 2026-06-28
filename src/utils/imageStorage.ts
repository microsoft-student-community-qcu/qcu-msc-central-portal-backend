import * as fs from "node:fs";
import * as path from "node:path";
import { env } from "../config/env";

export function ensureStorageDir(): string {
  const dir = path.resolve(env.IMAGE_STORAGE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function saveImage(buffer: Buffer, filename: string): string {
  const dir = ensureStorageDir();
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

export function getImagePath(filename: string): string {
  return path.join(path.resolve(env.IMAGE_STORAGE_PATH), filename);
}
