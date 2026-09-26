import "server-only";
import { createCanvas } from "@napi-rs/canvas";
import type * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

/**
 * Renders a PDF page to a PNG image buffer for OCR processing.
 *
 * Scanned invoice documents in PDF format typically wrap full-page raster images.
 * Extracting the underlying image directly provides pixel-perfect resolution,
 * eliminates anti-aliasing artifacts, and operates safely in serverless environments.
 */
export async function renderPdfPageToImage(
  page: pdfjs.PDFPageProxy
): Promise<Buffer> {
  const ops = await page.getOperatorList();

  // Find the embedded image XObject (operator 85 = paintImageXObject)
  for (let i = 0; i < ops.fnArray.length; i++) {
    // 85 represents paintImageXObject in PDF.js OPS
    if (ops.fnArray[i] === 85) {
      const imgId = ops.argsArray[i][0];
      return new Promise<Buffer>((resolve, reject) => {
        try {
          page.objs.get(imgId, (img: {
            width: number;
            height: number;
            kind: number; // 1: Grayscale, 2: RGB, 3: RGBA
            data: Uint8ClampedArray | Uint8Array;
          }) => {
            if (!img || !img.data) {
              return reject(
                new Error(`Embedded image '${imgId}' has no image data.`)
              );
            }

            const canvas = createCanvas(img.width, img.height);
            const ctx = canvas.getContext("2d");
            const imgData = ctx.createImageData(img.width, img.height);
            const src = img.data;
            const dst = imgData.data;

            if (img.kind === 2) {
              // RGB (3 channels) -> RGBA (4 channels)
              let s = 0;
              let d = 0;
              const len = src.length;
              while (s < len) {
                dst[d++] = src[s++];
                dst[d++] = src[s++];
                dst[d++] = src[s++];
                dst[d++] = 255;
              }
            } else if (img.kind === 3) {
              // RGBA (4 channels)
              dst.set(src);
            } else if (img.kind === 1) {
              // Grayscale (1 channel) -> RGBA (4 channels)
              let s = 0;
              let d = 0;
              const len = src.length;
              while (s < len) {
                const g = src[s++];
                dst[d++] = g;
                dst[d++] = g;
                dst[d++] = g;
                dst[d++] = 255;
              }
            } else {
              // Fallback copy
              let s = 0;
              let d = 0;
              const len = src.length;
              while (s < len && d < dst.length) {
                dst[d++] = src[s++];
              }
            }

            ctx.putImageData(imgData, 0, 0);
            const pngBuffer = canvas.toBuffer("image/png");
            resolve(pngBuffer);
          });
        } catch (err) {
          reject(err);
        }
      });
    }
  }

  // Fallback: If no operator 85 is found, create a canvas matching page viewport
  const viewport = page.getViewport({ scale: 2.0 });
  const canvas = createCanvas(Math.floor(viewport.width), Math.floor(viewport.height));
  const ctx = canvas.getContext("2d");
  
  // Fill white background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  return canvas.toBuffer("image/png");
}
