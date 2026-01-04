import { notFound } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { formatCurrency } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckCircle2 } from 'lucide-react'
import { ConfirmationClient } from './client'

interface Props {
  params: Promise<{ id: string }>
}

/**
 * Order confirmation page
 * Displays order number and thanks the customer
 * Clears cart on client side
 */
export default async function ConfirmationPage({ params }: Props) {
  const { id } = await params

  // Validate orderId is a number
  const orderId = parseInt(id, 10)
  if (isNaN(orderId)) {
    notFound()
  }

  const order = await prisma.customerOrders.findUnique({
    where: { ID: BigInt(orderId) },
    select: {
      ID: true,
      OrderNumber: true,
      StoreName: true,
      CustomerEmail: true,
      OrderAmount: true,
      Country: true, // Actually stores currency
      OrderDate: true,
    },
  })

  if (!order) {
    notFound()
  }

  // Determine currency from Country field (legacy behavior)
  const currency = order.Country?.toUpperCase().includes('CAD') ? 'CAD' : 'USD'

  return (
    <div className="container mx-auto py-12 px-4">
      {/* Client component to clear cart */}
      <ConfirmationClient />

      <div className="max-w-lg mx-auto text-center">
        <Card>
          <CardContent className="pt-8 pb-8">
            <div className="mb-6">
              <CheckCircle2 className="size-16 text-green-500 mx-auto" />
            </div>

            <h1 className="text-3xl font-bold text-green-600 mb-4">
              Order Confirmed!
            </h1>

            <div className="space-y-4 mb-8">
              <p className="text-xl">
                Order Number: <strong>{order.OrderNumber}</strong>
              </p>

              <p className="text-muted-foreground">
                Thank you for your order, <strong>{order.StoreName}</strong>!
              </p>

              <p className="text-muted-foreground">
                A confirmation email will be sent to{' '}
                <strong>{order.CustomerEmail}</strong>.
              </p>

              <div className="border-t border-b py-4 my-4">
                <p className="text-lg">
                  Order Total:{' '}
                  <strong>
                    {formatCurrency(order.OrderAmount, currency as 'USD' | 'CAD')}
                  </strong>
                </p>
                <p className="text-sm text-muted-foreground">
                  Ordered on{' '}
                  {order.OrderDate.toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button asChild>
                <Link href="/buyer/select-journey">Continue Shopping</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/buyer/ats">Browse ATS</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
