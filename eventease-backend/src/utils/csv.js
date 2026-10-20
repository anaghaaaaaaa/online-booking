const quote = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

export function toCsv(columns, rows) {
  return [columns, ...rows].map((row) => row.map(quote).join(',')).join('\r\n');
}

export function sendCsv(response, filename, csv) {
  response.setHeader('Content-Type', 'text/csv; charset=utf-8');
  response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  response.send(`\ufeff${csv}`);
}
