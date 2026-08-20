import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";

/**
 * Pulls plain text out of an uploaded resume so it can be scanned for skills.
 * PDF and DOCX need real parsers; anything else (.txt, unrecognized) is read as UTF-8 text.
 */
export async function extractResumeText(
  fileName: string,
  mimeType: string,
  bytes: Uint8Array,
): Promise<string> {
  const ext = fileName.split(".").pop()?.toLowerCase();

  if (mimeType === "application/pdf" || ext === "pdf") {
    const parser = new PDFParse({ data: bytes });
    try {
      const result = await parser.getText();
      return result.text;
    } finally {
      await parser.destroy();
    }
  }

  if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    ext === "docx"
  ) {
    const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    return result.value;
  }

  return Buffer.from(bytes).toString("utf-8");
}
