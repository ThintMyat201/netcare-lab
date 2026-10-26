/** Download rows as a UTF-8 CSV file, neutralising spreadsheet formula prefixes. */
export function downloadCSV(name: string, rows: any[][]) {
  const escape = (v: any) =>
    '"' +
    String(v ?? '')
      .replace(/^[=+@-]/, "'")
      .replace(/"/g, '""') +
    '"';
  const blob = new Blob(['\ufeff' + rows.map(r => r.map(escape).join(',')).join('\r\n')], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
