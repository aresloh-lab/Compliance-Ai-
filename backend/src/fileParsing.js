import ExcelJS from "exceljs";

const MAX_TEXT_CHARS = 40000; // keep prompt size reasonable

export const SPREADSHEET_MIMETYPES = new Set([
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
]);

function truncate(text) {
  return text.length > MAX_TEXT_CHARS ? `${text.slice(0, MAX_TEXT_CHARS)}\n... (truncated)` : text;
}

export async function extractTextFromSpreadsheet(buffer, mimetype) {
  if (mimetype === "text/csv") {
    return truncate(buffer.toString("utf-8"));
  }

  // .xlsx only — the legacy binary .xls format isn't supported by exceljs.
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const parts = [];
  workbook.eachSheet((sheet) => {
    parts.push(`--- Sheet: ${sheet.name} ---`);
    sheet.eachRow((row) => {
      const values = row.values.slice(1); // values[0] is unused (rows are 1-indexed)
      parts.push(values.map((v) => (v == null ? "" : String(v))).join(","));
    });
  });

  return truncate(parts.join("\n"));
}
