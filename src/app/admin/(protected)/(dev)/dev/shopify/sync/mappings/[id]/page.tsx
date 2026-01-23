import { redirect } from 'next/navigation';

export default function MappingDetailRedirect({
  params: _params,
}: {
  params: { id: string };
}) {
  redirect('/admin/dev/shopify/sync/mappings');
}
