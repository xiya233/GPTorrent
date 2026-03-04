import { mkdir } from "node:fs/promises";
import path from "node:path";
import { getDataRoot } from "@/lib/offline/config";

export function normalizeRelativePath(rawPath: string) {
  return rawPath.replace(/\\/g, "/").replace(/^\/+/, "");
}

export function resolveDataRelativePath(relativePath: string) {
  const dataRoot = getDataRoot();
  const normalized = normalizeRelativePath(relativePath);
  const target = path.resolve(dataRoot, normalized);

  if (!target.startsWith(`${dataRoot}${path.sep}`) && target !== dataRoot) {
    return null;
  }

  return target;
}

export function relativeToData(absPath: string) {
  const dataRoot = getDataRoot();
  const normalized = path.resolve(absPath);

  if (!normalized.startsWith(`${dataRoot}${path.sep}`) && normalized !== dataRoot) {
    return null;
  }

  return normalizeRelativePath(path.relative(dataRoot, normalized));
}

export async function ensureDir(dirPath: string) {
  await mkdir(dirPath, { recursive: true });
}
