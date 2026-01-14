/**
 * Reports Export API Route
 * ============================================================================
 * Exports report data to XLSX, PDF, or CSV.
 * Path: src/app/api/reports/export/route.ts
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/providers';
import ExcelJS from 'exceljs';
import type { ReportType } from '@/lib/types/report';
import { getReportConfig } from '@/lib/types/report';
import { generatePdf, wrapHtml } from '@/lib/pdf/generate';

// ============================================================================
// Export Handlers
// ============================================================================

async function fetchReportData(
  request: NextRequest,
  reportType: ReportType
): Promise<{ data: Record<string, unknown>[]; totalCount: number }> {
  const { searchParams } = new URL(request.url);
  
  // Build params for the main reports endpoint
  const params = new URLSearchParams();
  params.set('type', reportType);
  params.set('page', '1');
  params.set('pageSize', '10000'); // Get all data for export
  
  if (searchParams.get('filters')) {
    params.set('filters', searchParams.get('filters')!);
  }
  if (searchParams.get('sortBy')) {
    params.set('sortBy', searchParams.get('sortBy')!);
    params.set('sortDir', searchParams.get('sortDir') || 'desc');
  }
  
  // Internal fetch to reports API
  const baseUrl = request.url.split('/api/')[0];
  const response = await fetch(`${baseUrl}/api/reports?${params.toString()}`, {
    headers: {
      cookie: request.headers.get('cookie') || '',
    },
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch report data');
  }
  
  return response.json();
}

async function exportToXLSX(
  data: Record<string, unknown>[],
  config: ReturnType<typeof getReportConfig>,
  visibleColumns: string[]
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'OrderHub';
  workbook.created = new Date();
  
  const sheet = workbook.addWorksheet(config.name);
  
  // Get columns in order
  const columns = config.allColumns.filter(
    (c) => visibleColumns.length === 0 || visibleColumns.includes(c.id)
  );
  
  // Add headers
  const headerRow = sheet.addRow(columns.map((c) => c.label));
  
  // Style header row (matches .NET: dark blue fill, white text, bold)
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1F2937' }, // Dark blue/gray
    };
    cell.font = {
      bold: true,
      color: { argb: 'FFFFFFFF' },
    };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = {
      bottom: { style: 'thin', color: { argb: 'FF374151' } },
    };
  });
  
  // Set column widths
  columns.forEach((col, index) => {
    const column = sheet.getColumn(index + 1);
    column.width = col.width || (col.type === 'currency' ? 15 : col.type === 'number' ? 12 : 20);
    
    // Set alignment
    if (col.align === 'right') {
      column.alignment = { horizontal: 'right' };
    }
  });
  
  // Add data rows
  for (const row of data) {
    const rowData = columns.map((col) => {
      const value = row[col.id];
      if (value === null || value === undefined) return '';
      
      if (col.type === 'currency' || col.type === 'number') {
        return Number(value);
      }
      if (col.type === 'percent') {
        return Number(value);
      }
      if (col.type === 'date' && value) {
        return new Date(String(value));
      }
      return String(value);
    });
    
    const dataRow = sheet.addRow(rowData);
    
    // Format cells based on column type
    columns.forEach((col, index) => {
      const cell = dataRow.getCell(index + 1);
      
      if (col.type === 'currency') {
        cell.numFmt = '$#,##0.00';
      } else if (col.type === 'percent') {
        cell.numFmt = '0.0%';
      } else if (col.type === 'number') {
        cell.numFmt = '#,##0';
      } else if (col.type === 'date') {
        cell.numFmt = 'yyyy-mm-dd';
      }
    });
  }
  
  // Add totals row if applicable
  if (data.length > 0) {
    const hasNumericCols = columns.some(
      (c) => c.type === 'number' || c.type === 'currency'
    );
    
    if (hasNumericCols) {
      const totalsRow = sheet.addRow(
        columns.map((col, index) => {
          if (index === 0) return 'TOTAL';
          if (col.type === 'number' || col.type === 'currency') {
            return data.reduce((sum, row) => sum + (Number(row[col.id]) || 0), 0);
          }
          return '';
        })
      );
      
      totalsRow.eachCell((cell) => {
        cell.font = { bold: true };
        cell.border = {
          top: { style: 'double', color: { argb: 'FF374151' } },
        };
      });
    }
  }
  
  // Freeze header row
  sheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];
  
  // Generate buffer
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return arrayBuffer as ArrayBuffer;
}

async function exportToCSV(
  data: Record<string, unknown>[],
  config: ReturnType<typeof getReportConfig>,
  visibleColumns: string[]
): Promise<string> {
  const columns = config.allColumns.filter(
    (c) => visibleColumns.length === 0 || visibleColumns.includes(c.id)
  );
  
  const headers = columns.map((c) => `"${c.label.replace(/"/g, '""')}"`).join(',');
  
  const rows = data.map((row) =>
    columns
      .map((col) => {
        const value = row[col.id];
        if (value === null || value === undefined) return '';
        
        const strValue = String(value);
        // Escape quotes and wrap in quotes if contains comma, quote, or newline
        if (strValue.includes(',') || strValue.includes('"') || strValue.includes('\n')) {
          return `"${strValue.replace(/"/g, '""')}"`;
        }
        return strValue;
      })
      .join(',')
  );
  
  return [headers, ...rows].join('\n');
}

// ============================================================================
// Main Handler
// ============================================================================

export async function GET(request: NextRequest) {
  // Auth check
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    
    const reportType = (searchParams.get('type') || 'category-totals') as ReportType;
    const format = searchParams.get('format') || 'xlsx';
    const colsParam = searchParams.get('cols');
    const visibleColumns = colsParam ? colsParam.split(',') : [];
    
    const config = getReportConfig(reportType);
    
    // Fetch report data
    const { data } = await fetchReportData(request, reportType);
    
    // Generate filename
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `${config.name.replace(/\s+/g, '-').toLowerCase()}-${timestamp}`;
    
    switch (format) {
      case 'xlsx': {
        const xlsxData = await exportToXLSX(data, config, visibleColumns);
        return new NextResponse(xlsxData, {
          headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="${filename}.xlsx"`,
          },
        });
      }
      
      case 'csv': {
        const csv = await exportToCSV(data, config, visibleColumns);
        return new NextResponse(csv, {
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="${filename}.csv"`,
          },
        });
      }
      
      case 'pdf': {
        const columns = config.allColumns.filter(
          (c) => visibleColumns.length === 0 || visibleColumns.includes(c.id)
        );

        // Build HTML table
        const tableRows = data.map(row =>
          `<tr>${columns.map(col => {
            const value = row[col.id];
            const formatted = value === null || value === undefined ? '—' :
              col.type === 'currency' ? `$${Number(value).toLocaleString()}` :
              col.type === 'percent' ? `${(Number(value) * 100).toFixed(1)}%` :
              col.type === 'number' ? Number(value).toLocaleString() :
              String(value);
            return `<td class="${col.align === 'right' ? 'text-right' : ''}">${formatted}</td>`;
          }).join('')}</tr>`
        ).join('\n');

        const html = wrapHtml(`
          <div class="pdf-header">
            <div class="pdf-header-left">
              <span class="pdf-logo">OrderHub</span>
            </div>
            <div class="pdf-header-right">
              <div class="pdf-title">${config.name}</div>
              <div class="pdf-subtitle">Generated ${new Date().toLocaleDateString()}</div>
            </div>
          </div>

          <table class="pdf-table">
            <thead>
              <tr>${columns.map(col => 
                `<th class="${col.align === 'right' ? 'text-right' : ''}">${col.label}</th>`
              ).join('')}</tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>

          <div class="pdf-footer">
            <span>${data.length} records</span>
            <span>${config.name} - ${new Date().toISOString()}</span>
          </div>
        `, config.name);

        try {
          const pdfBuffer = await generatePdf(html, {
            landscape: columns.length > 6,
          });

          return new Response(Buffer.from(pdfBuffer), {
            headers: {
              'Content-Type': 'application/pdf',
              'Content-Disposition': `attachment; filename="${filename}.pdf"`,
            },
          });
        } catch (error) {
          console.error('PDF generation error:', error);
          return NextResponse.json(
            { error: 'PDF generation failed. Try XLSX or CSV.' },
            { status: 500 }
          );
        }
      }
      
      default:
        return NextResponse.json({ error: 'Unsupported format' }, { status: 400 });
    }
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Export failed' },
      { status: 500 }
    );
  }
}
