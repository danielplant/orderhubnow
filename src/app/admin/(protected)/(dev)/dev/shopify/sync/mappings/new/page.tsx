import { redirect } from 'next/navigation';

// Mapping creation is not implemented yet; redirect to mapping docs.
export default function MappingNewRedirect() {
  redirect('/admin/dev/shopify/sync/mappings');
}
