import { redirect } from 'next/navigation';

// Schema discovery has been consolidated; redirect to sync dashboard for now.
export default function SchemaRedirect() {
  redirect('/admin/dev/shopify/sync');
}
