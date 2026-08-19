import { extractTextFromSpreadsheet, SPREADSHEET_MIMETYPES } from "./fileParsing.js";

export const ACCEPTED_FILE_TYPES_NOTE = "images, PDF, .xlsx, or .csv";

// Turns any accepted upload (image, PDF, spreadsheet) into the right Claude
// message content block(s) — vision/document blocks for images and PDFs,
// or a plain text block of the parsed contents for spreadsheets (Claude
// reads structured text fine; no need for a code-execution sandbox for this).
export async function fileToContentBlocks(file, { textLabel = "Spreadsheet" } = {}) {
  const { mimetype, buffer, originalname } = file;

  if (mimetype.startsWith("image/")) {
    return [{ type: "image", source: { type: "base64", media_type: mimetype, data: buffer.toString("base64") } }];
  }
  if (mimetype === "application/pdf") {
    return [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: buffer.toString("base64") } }];
  }
  if (SPREADSHEET_MIMETYPES.has(mimetype)) {
    const text = await extractTextFromSpreadsheet(buffer, mimetype);
    return [{ type: "text", text: `${textLabel} (${originalname}):\n${text}` }];
  }

  const err = new Error(`Unsupported file type "${mimetype}". Supported: ${ACCEPTED_FILE_TYPES_NOTE}.`);
  err.status = 400;
  throw err;
}
