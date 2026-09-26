import "server-only";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { createWorker, type Worker } from "tesseract.js";

export type OcrWorker = Worker;

/**
 * Result of OCR extraction on an image.
 */
export interface OcrExtractionResult {
  text: string;
  confidence: number;
  method: "ocr";
}

/**
 * Resolves the path to the bundled local English traineddata.
 */
export function getBundledTessdataPath(): string {
  // Check standard project asset location
  const projectTessdata = path.resolve(process.cwd(), "assets/tessdata");
  if (fs.existsSync(path.join(projectTessdata, "eng.traineddata"))) {
    return projectTessdata;
  }

  // Fallback relative to current module
  const relativePath = path.resolve(__dirname, "../../../assets/tessdata");
  if (fs.existsSync(path.join(relativePath, "eng.traineddata"))) {
    return relativePath;
  }

  return projectTessdata;
}

/**
 * Creates a Tesseract.js worker configured to use local bundled traineddata
 * without downloading from the Internet.
 *
 * Worker Management Invariant:
 * Created once per extraction job/request and reused across pages requiring OCR.
 */
export async function createLocalOcrWorker(): Promise<OcrWorker> {
  const tessdataPath = getBundledTessdataPath();
  const cachePath = path.join(os.tmpdir(), "tessdata-cache");

  if (!fs.existsSync(cachePath)) {
    try {
      fs.mkdirSync(cachePath, { recursive: true });
    } catch {
      // Ignore if cache directory already exists or cannot be created
    }
  }

  const worker = await createWorker("eng", 1, {
    langPath: tessdataPath,
    cachePath: cachePath,
    gzip: false,
  });

  return worker;
}

/**
 * Runs OCR on a rendered page image buffer using an active worker.
 *
 * Invariant: Preserves raw OCR output verbatim.
 * NEVER autocorrects characters based on arithmetic (e.g. '$491.4O' is kept as '$491.4O').
 */
export async function performOcrOnImageBuffer(
  imageBuffer: Buffer,
  worker: OcrWorker
): Promise<OcrExtractionResult> {
  const result = await worker.recognize(imageBuffer);

  return {
    text: result.data.text,
    confidence: result.data.confidence,
    method: "ocr",
  };
}
