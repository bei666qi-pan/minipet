import path from "node:path";
import { app, nativeImage, type NativeImage } from "electron";

export type BrandAssetName = "icon.ico" | "icon.png";

export function brandAssetPath(fileName: BrandAssetName): string {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  if (app.isPackaged && resourcesPath) {
    return path.join(resourcesPath, "brand", fileName);
  }
  return path.join(app.getAppPath(), "build", fileName);
}

export function createBrandTrayImage(): NativeImage {
  const image = nativeImage.createFromPath(brandAssetPath("icon.png"));
  if (image.isEmpty()) return nativeImage.createEmpty();
  return image.resize({ width: 18, height: 18, quality: "best" });
}
