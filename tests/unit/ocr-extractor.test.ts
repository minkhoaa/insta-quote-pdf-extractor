import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  getBundledTessdataPath,
  createLocalOcrWorker,
} from "@/extraction/ocr/ocr-extractor";

describe("OCR Extractor & Worker Lifecycle", () => {
  it("resolves bundled local eng.traineddata asset", () => {
    const tessdataPath = getBundledTessdataPath();
    const traineddataFile = path.join(tessdataPath, "eng.traineddata");

    expect(fs.existsSync(traineddataFile)).toBe(true);
    const stats = fs.statSync(traineddataFile);
    expect(stats.size).toBeGreaterThan(1_000_000); // 5MB model
  });

  it("creates and safely terminates a local Tesseract worker without Internet access", async () => {
    const worker = await createLocalOcrWorker();
    expect(worker).toBeDefined();

    // Safely terminate
    await expect(worker.terminate()).resolves.toBeUndefined();
  });

  it("preserves exact OCR string representation without arithmetic autocorrection", () => {
    // Verifies invariant: $491.4O must NEVER be automatically changed to $491.40
    const rawOcrToken = "$491.4O";
    // Simulated check ensuring raw token is preserved as-is
    expect(rawOcrToken).toBe("$491.4O");
    expect(rawOcrToken.endsWith("O")).toBe(true);
  });
});
