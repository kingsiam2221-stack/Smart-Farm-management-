import * as XLSX from 'xlsx';

export interface ExportSheet {
  sheetName: string;
  rows: Array<Record<string, string | number>>;
}

export function exportToExcel(filename: string, sheets: ExportSheet[]): void {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const data = sheet.rows.length > 0 ? sheet.rows : [{ তথ্য: 'কোনো রেকর্ড পাওয়া যায়নি' }];
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, sheet.sheetName.slice(0, 31));
  }
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

export function printReportAsPdf(): void {
  window.print();
}
