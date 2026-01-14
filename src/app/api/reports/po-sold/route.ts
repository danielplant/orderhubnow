/**
 * PO Sold Report - XLSX Export
 * Matches .NET POSoldReport.aspx export functionality
 */

import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { auth } from '@/lib/auth/providers';
import { getPOSoldData, getPOSoldGrandTotal } from '@/lib/data/queries/dashboard';
import type { POSoldRow } from '@/lib/data/mappers/dashboard';

// Map size column keys to display headers (matching .NET)
const SIZE_COLUMN_CONFIG: { key: keyof POSoldRow; header: string }[] = [
  { key: 'size2', header: '2' },
  { key: 'size3', header: '3' },
  { key: 'size2_3', header: '2/3' },
  { key: 'size4', header: '4' },
  { key: 'size5', header: '5' },
  { key: 'size4_5', header: '4/5' },
  { key: 'size6', header: '6' },
  { key: 'size5_6', header: '5/6' },
  { key: 'size7', header: '7' },
  { key: 'size8', header: '8' },
  { key: 'size7_8', header: '7/8' },
  { key: 'size10', header: '10' },
  { key: 'size12', header: '12' },
  { key: 'size10_12', header: '10/12' },
  { key: 'size14', header: '14' },
  { key: 'size16', header: '16' },
  { key: 'size14_16', header: '14/16' },
  { key: 'size6_6X', header: '6/6X' },
  { key: 'size2T_4T', header: '2T-4T' },
  { key: 'size4_6', header: '4-6' },
  { key: 'size7_16', header: '7-16' },
  { key: 'size7_10', header: '7-10' },
  { key: 'sizeM_L', header: 'M/L' },
  { key: 'sizeXS_S', header: 'XS/S' },
  { key: 'size12M_24M', header: '12M-24M' },
  { key: 'sizeO_S', header: 'O/S' },
];

export async function GET() {
  try {
    // Check authentication
    const session = await auth();
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Fetch data
    const [data, grandTotal] = await Promise.all([
      getPOSoldData(),
      getPOSoldGrandTotal(),
    ]);
    
    // Create workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'OrderHub';
    workbook.created = new Date();
    
    const sheet = workbook.addWorksheet('PO Sold Report');
    
    // Build columns array (matching .NET's column structure)
    const columns: Partial<ExcelJS.Column>[] = [
      { header: 'SKU', key: 'sku', width: 15 },
      { header: 'Category', key: 'categoryName', width: 20 },
    ];
    
    // Add size columns (width 8 for compact display)
    for (const sizeCol of SIZE_COLUMN_CONFIG) {
      columns.push({
        header: sizeCol.header,
        key: sizeCol.key,
        width: 8,
      });
    }
    
    // Add total column
    columns.push({ header: 'Total', key: 'total', width: 10 });
    
    sheet.columns = columns;
    
    // Style header row
    const headerRow = sheet.getRow(1);
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4F81BD' }, // Blue background
    };
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }; // White text
    
    // Add data rows
    for (const row of data) {
      const rowData: Record<string, string | number> = {
        sku: row.sku,
        categoryName: row.categoryName,
        total: row.total,
      };
      
      // Add size columns
      for (const sizeCol of SIZE_COLUMN_CONFIG) {
        rowData[sizeCol.key] = row[sizeCol.key];
      }
      
      sheet.addRow(rowData);
    }
    
    // Add grand total row
    const totalRowData: Record<string, string | number> = {
      sku: 'GRAND TOTAL',
      categoryName: '',
      total: grandTotal,
    };
    
    // Initialize size columns to 0 for total row
    for (const sizeCol of SIZE_COLUMN_CONFIG) {
      totalRowData[sizeCol.key] = '';
    }
    
    const totalRow = sheet.addRow(totalRowData);
    totalRow.font = { bold: true };
    
    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();
    
    // Return file (filename matches .NET pattern)
    const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const filename = `Limeapple_POSoldQuantityReport_${timestamp}.xlsx`;
    
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('PO Sold export error:', error);
    return NextResponse.json(
      { error: 'Failed to generate report' },
      { status: 500 }
    );
  }
}

// Keep stubs for other methods to avoid 405 errors
export async function POST() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}

export async function PATCH() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}

export async function DELETE() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
