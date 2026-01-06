import { redirect } from 'next/navigation'

interface DraftPageProps {
  params: Promise<{ id: string }>
}

/**
 * /draft/[id] - Shareable draft link redirect
 * 
 * Redirects to /buyer/my-order?draft=[id] which loads the draft
 * into the order form context.
 */
export default async function DraftPage({ params }: DraftPageProps) {
  const { id } = await params
  redirect(`/buyer/my-order?draft=${encodeURIComponent(id)}`)
}
