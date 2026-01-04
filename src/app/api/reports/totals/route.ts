/**
 * Category Totals Report - XLSX Export
 * Matches .NET Report.aspx export functionality
 */

import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { auth } from '@/lib/auth/providers';
import { getCategoryTotals } from '@/lib/data/queries/dashboard';

export async function GET() {
  try {
    // Check authentication
    const session = await auth();
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Fetch data
    const data = await getCategoryTotals();
    
    // Create workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'MyOrderHub';
    workbook.created = new Date();
    
    const sheet = workbook.addWorksheet('Category Totals');
    
    // Set column widths (matching .NET's 15-width minimum for first columns)
    sheet.columns = [
      { header: 'Main Category', key: 'mainCategory', width: 20 },
      { header: 'Sub Category', key: 'subCategory', width: 25 },
      { header: 'Quantity', key: 'quantity', width: 15 },
    ];
    
    // Style header row
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4F81BD' }, // Blue background
    };
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }; // White text
    
    // Add data rows
    for (const item of data.items) {
      sheet.addRow({
        mainCategory: item.mainCategory,
        subCategory: item.subCategory,
        quantity: item.quantity,
      });
    }
    
    // Add grand total row
    const totalRow = sheet.addRow({
      mainCategory: 'GRAND TOTAL',
      subCategory: '',
      quantity: data.grandTotal,
    });
    totalRow.font = { bold: true };
    
    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();
    
    // Return file
    const filename = `Limeapple_Category_Totals_${new Date().toISOString().split('T')[0]}.xlsx`;
    
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Category Totals export error:', error);
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
