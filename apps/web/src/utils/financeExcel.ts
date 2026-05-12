import * as XLSX from "xlsx";

type CellValue = string | number | boolean | null | undefined;
export type WorkbookSheet = {
  name: string;
  rows: Array<Record<string, CellValue>>;
};

function buildSheet(rows: Array<Record<string, CellValue>>) {
  if (!rows.length) {
    return XLSX.utils.aoa_to_sheet([["Aucune donnee disponible"]]);
  }
  return XLSX.utils.json_to_sheet(rows);
}

export function exportWorkbook(filename: string, sheets: WorkbookSheet[]) {
  const workbook = XLSX.utils.book_new();

  for (const sheet of sheets) {
    const worksheet = buildSheet(sheet.rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name.slice(0, 31) || "Feuille");
  }

  XLSX.writeFile(workbook, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}
