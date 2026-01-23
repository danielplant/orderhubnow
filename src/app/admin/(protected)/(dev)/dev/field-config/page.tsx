import { redirect } from 'next/navigation';

// Temporary redirect until field config is split out of Shopify config.
export default function FieldConfigRedirect() {
  redirect('/admin/dev/shopify/config');
}
