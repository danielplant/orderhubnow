/**
 * Reports Page
 * ============================================================================
 * Interactive report viewer for analytics.
 * Path: src/app/admin/reports/page.tsx
 */

import { Suspense } from 'react';
import { auth } from '@/lib/auth/providers';
import { redirect } from 'next/navigation';
import { ReportsPageClient } from '@/components/admin/reports-page-client';
import { Loader2 } from 'lucide-react';

export const metadata = {
  title: 'Reports | Admin',
  description: 'Interactive analytics and reports',
};

function ReportsLoading() {
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

export default async function ReportsPage() {
  const session = await auth();

  // Ensure user is authenticated and is admin
  if (!session?.user || session.user.role !== 'admin') {
    redirect('/admin/login');
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
        <p className="text-muted-foreground">
          Interactive analytics and data exploration
        </p>
      </div>

      {/* Reports Client */}
      <Suspense fallback={<ReportsLoading />}>
        <ReportsPageClient initialType="category-totals" />
      </Suspense>
    </div>
  );
}
