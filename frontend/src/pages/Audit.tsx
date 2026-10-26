import { useState, useEffect } from 'react';
import { Download, FileText, Search, RefreshCw } from 'lucide-react';
import { PageTitle, Button, ErrorBox, Loading, Empty, useData } from '../components/shared';
import { time } from '../lib/api';
import { downloadCSV } from '../lib/csv';

export function Audit() {
  const { data, error, busy, load } = useData('/audit');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const onWorkflowUpdate = () => load();
    window.addEventListener('atlas-workflow-updated', onWorkflowUpdate);
    window.addEventListener('atlas-user-profile-updated', onWorkflowUpdate);
    return () => {
      window.removeEventListener('atlas-workflow-updated', onWorkflowUpdate);
      window.removeEventListener('atlas-user-profile-updated', onWorkflowUpdate);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = data?.filter((a: any) =>
    (a.action + ' ' + a.actor + ' ' + a.detail).toLowerCase().includes(search.toLowerCase()),
  );

  const exportPDF = () => {
    if (!rows || rows.length === 0) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow popups to export the PDF activity log.');
      return;
    }

    const genTime = time(new Date().toISOString(), true);

    const escapeHtml = (str: string) => {
      if (!str) return '';
      return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    };

    const tableRows = rows
      .map(
        (a: any) => `
      <tr>
        <td class="mono whitespace-nowrap">${escapeHtml(time(a.timestamp, true))} MYT</td>
        <td class="font-medium">${escapeHtml(a.actor || 'System')}</td>
        <td><span class="action-badge">${escapeHtml(a.action || '')}</span></td>
        <td class="detail">${escapeHtml(a.detail || '')}</td>
      </tr>`,
      )
      .join('');

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>atlas-activity-log-${new Date().toISOString().slice(0, 10)}</title>
  <style>
    @page { size: A4 portrait; margin: 12mm 15mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #0f172a;
      background: #ffffff;
      margin: 0;
      padding: 24px;
      line-height: 1.5;
      font-size: 12px;
    }
    .header {
      border-bottom: 2px solid #0284c7;
      padding-bottom: 12px;
      margin-bottom: 16px;
    }
    .header h1 {
      font-size: 20px;
      font-weight: 800;
      color: #0f172a;
      margin: 0 0 4px 0;
      letter-spacing: -0.02em;
    }
    .header .meta {
      font-size: 11px;
      color: #475569;
      display: flex;
      justify-content: space-between;
    }
    .summary-bar {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 8px 12px;
      margin-bottom: 16px;
      font-size: 11px;
      color: #475569;
      display: flex;
      justify-content: space-between;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
    }
    th {
      background: #f1f5f9;
      color: #475569;
      font-weight: 700;
      text-transform: uppercase;
      font-size: 10px;
      letter-spacing: 0.05em;
      padding: 8px 10px;
      border: 1px solid #e2e8f0;
      text-align: left;
    }
    td {
      padding: 7px 10px;
      border: 1px solid #e2e8f0;
      color: #1e293b;
      vertical-align: top;
    }
    tr:nth-child(even) td {
      background: #f8fafc;
    }
    .mono {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 10.5px;
      color: #334155;
    }
    .whitespace-nowrap {
      white-space: nowrap;
    }
    .font-medium {
      font-weight: 600;
      color: #0f172a;
    }
    .action-badge {
      display: inline-block;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 10px;
      font-weight: 600;
      padding: 1px 5px;
      border-radius: 4px;
      background: #f1f5f9;
      border: 1px solid #e2e8f0;
      color: #0f172a;
    }
    .detail {
      color: #475569;
    }
    .footer {
      margin-top: 20px;
      padding-top: 10px;
      border-top: 1px solid #e2e8f0;
      font-size: 10px;
      color: #64748b;
      display: flex;
      justify-content: space-between;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Atlas NetCare — Campus Activity Log</h1>
    <div class="meta">
      <span>APU University Main Campus · Asia/Kuala Lumpur (MYT)</span>
      <span>Exported: <strong>${genTime} MYT</strong></span>
    </div>
  </div>

  <div class="summary-bar">
    <span>Total Entries Exported: <strong>${rows.length}</strong></span>
    <span>Scope: Chronological audit trail of campus operations and hardware events</span>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width: 130px;">Timestamp (MYT)</th>
        <th style="width: 140px;">Performed By</th>
        <th style="width: 140px;">Action</th>
        <th>Details</th>
      </tr>
    </thead>
    <tbody>
      ${tableRows}
    </tbody>
  </table>

  <div class="footer">
    <span>Atlas NetCare Operational Management &amp; ITAM Platform</span>
    <span>Campus Timezone: Asia/Kuala Lumpur (MYT) · Page generated for official audit</span>
  </div>
</body>
</html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 300);
  };

  return (
    <>
      <PageTitle title="Activity Log">
        <Button id="refresh-audit" onClick={load}>
          <RefreshCw size={15} />
          Refresh Log
        </Button>
        <button
          type="button"
          id="export-audit"
          data-testid="export-audit-csv"
          onClick={() =>
            downloadCSV('atlas-activity-log.csv', [
              ['Timestamp MYT', 'Actor', 'Action', 'Detail'],
              ...(rows || []).map((a: any) => [a.timestamp, a.actor, a.action, a.detail]),
            ])
          }
          disabled={!data}
          className="inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700/80 hover:bg-slate-50 dark:hover:bg-slate-800 outline-none focus:outline-none focus:ring-0 transition-colors whitespace-nowrap disabled:opacity-50"
        >
          <Download size={15} />
          <span>Export CSV</span>
        </button>
        <button
          type="button"
          id="export-audit-pdf"
          data-testid="export-audit-pdf"
          onClick={exportPDF}
          disabled={!data}
          className="inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-sm border border-transparent outline-none focus:outline-none focus:ring-0 transition-colors whitespace-nowrap disabled:opacity-50"
        >
          <FileText size={15} />
          <span>Export PDF</span>
        </button>
      </PageTitle>

      <ErrorBox error={error} retry={load} />

      <div className="page-search">
        <div className="search-field">
          <Search size={15} />
          <input
            data-testid="audit-search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by actor, action, or equipment…"
          />
        </div>
        <span className="count-label" data-testid="audit-count">
          {rows?.length || 0} events · latest 1,000 records
        </span>
      </div>

      {busy && !data ? (
        <Loading />
      ) : rows?.length ? (
        <div className="table-wrap w-full overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <div className="w-full overflow-x-auto">
            <table className="data-table w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-900/50 text-xs font-semibold tracking-wider text-slate-500 uppercase">
                  <th className="px-5 py-4">TIMESTAMP (MYT)</th>
                  <th className="px-5 py-4">PERFORMED BY</th>
                  <th className="px-5 py-4">ACTION</th>
                  <th className="px-5 py-4">DETAILS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {rows.map((a: any) => (
                  <tr
                    key={a.id}
                    data-testid={`audit-event-${a.id}`}
                    className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"
                  >
                    <td className="px-5 py-4 mono small">{time(a.timestamp, true)} MYT</td>
                    <td className="px-5 py-4">{a.actor}</td>
                    <td className="px-5 py-4 audit-action">{a.action}</td>
                    <td className="px-5 py-4 audit-detail muted">{a.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <Empty text="No activity log events match your search." />
      )}
    </>
  );
}
