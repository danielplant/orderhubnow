/**
 * Report Export Buttons
 * ============================================================================
 * Export functionality for reports (XLSX, PDF, CSV).
 * Path: src/components/admin/report-export-buttons.tsx
 */

'use client';

import * as React from 'react';
import { Download, FileSpreadsheet, FileText, FileImage, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ExportFormat, ReportType } from '@/lib/types/report';
import { toast } from 'sonner';

const FORMAT_ICONS: Record<ExportFormat, React.ComponentType<{ className?: string }>> = {
  xlsx: FileSpreadsheet,
  pdf: FileText,
  csv: FileSpreadsheet,
  png: FileImage,
};

const FORMAT_LABELS: Record<ExportFormat, string> = {
  xlsx: 'Excel (.xlsx)',
  pdf: 'PDF',
  csv: 'CSV',
  png: 'Image (.png)',
};

interface ReportExportButtonsProps {
  reportType: ReportType;
  supportedFormats: ExportFormat[];
  params: Record<string, string>;
  disabled?: boolean;
}

export function ReportExportButtons({
  reportType,
  supportedFormats,
  params,
  disabled = false,
}: ReportExportButtonsProps) {
  const [exporting, setExporting] = React.useState<ExportFormat | null>(null);

  const handleExport = async (format: ExportFormat) => {
    if (exporting) return;
    
    setExporting(format);
    
    try {
      // Build query params for export
      const searchParams = new URLSearchParams({
        ...params,
        type: reportType,
        format,
      });
      
      const response = await fetch(`/api/reports/export?${searchParams.toString()}`);
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || 'Export failed');
      }
      
      // Get filename from Content-Disposition header
      const disposition = response.headers.get('Content-Disposition');
      let filename = `report-${reportType}.${format}`;
      if (disposition) {
        const match = disposition.match(/filename="?([^"]+)"?/);
        if (match) filename = match[1];
      }
      
      // Download the file
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success(`Exported ${FORMAT_LABELS[format]}`);
    } catch (error) {
      console.error('Export error:', error);
      toast.error(error instanceof Error ? error.message : 'Export failed');
    } finally {
      setExporting(null);
    }
  };

  if (supportedFormats.length === 0) {
    return null;
  }

  // If only one format, show simple button
  if (supportedFormats.length === 1) {
    const format = supportedFormats[0];
    const Icon = FORMAT_ICONS[format];
    return (
      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={() => handleExport(format)}
        disabled={disabled || !!exporting}
      >
        {exporting === format ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Icon className="h-4 w-4" />
        )}
        Export
      </Button>
    );
  }

  // Multiple formats - show dropdown
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={disabled || !!exporting}
        >
          {exporting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {supportedFormats.map((format) => {
          const Icon = FORMAT_ICONS[format];
          return (
            <DropdownMenuItem
              key={format}
              onClick={() => handleExport(format)}
              disabled={!!exporting}
              className="gap-2"
            >
              <Icon className="h-4 w-4" />
              {FORMAT_LABELS[format]}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
