import { redirect } from 'next/navigation';

// Temporary redirect until status pipeline is split out of Shopify config.
export default function StatusPipelineRedirect() {
  redirect('/admin/dev/shopify/config');
}
