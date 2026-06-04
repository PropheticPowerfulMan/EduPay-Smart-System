type CellValue = string | number | boolean | null | undefined;
export type WorkbookSheet = {
  name: string;
  rows: Array<Record<string, CellValue>>;
};

function escapeHtml(value: CellValue) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sheetToHtml(sheet: WorkbookSheet) {
  const rows = sheet.rows;
  const headers = rows.length ? Array.from(new Set(rows.flatMap((row) => Object.keys(row)))) : ["Aucune donnee disponible"];
  const bodyRows = rows.length ? rows : [{ [headers[0]]: "" }];

  return `
    <h2>${escapeHtml(sheet.name)}</h2>
    <table>
      <thead>
        <tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr>
      </thead>
      <tbody>
        ${bodyRows.map((row) => `<tr>${headers.map((header) => `<td>${escapeHtml(row[header])}</td>`).join("")}</tr>`).join("")}
      </tbody>
    </table>
  `;
}

export function exportWorkbook(filename: string, sheets: WorkbookSheet[]) {
  const workbookHtml = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: Arial, sans-serif; }
          h2 { margin: 20px 0 8px; font-size: 16px; }
          table { border-collapse: collapse; margin-bottom: 24px; }
          th, td { border: 1px solid #94a3b8; padding: 6px 8px; mso-number-format:"\\@"; }
          th { background: #0f766e; color: #ffffff; font-weight: 700; }
        </style>
      </head>
      <body>${sheets.map(sheetToHtml).join("")}</body>
    </html>
  `;
  const blob = new Blob([workbookHtml], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".xls") ? filename : `${filename.replace(/\.xlsx$/i, "")}.xls`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
