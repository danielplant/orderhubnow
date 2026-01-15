/**
 * Order Tracking Page
 * 
 * Public page that displays order status and shipment tracking information.
 * Accessed via signed JWT token from shipment email.
 */

import { notFound } from 'next/navigation'
import { verifyTrackingToken } from '@/lib/tokens/order-tracking'
import { getPublicOrderTracking, type PublicOrderTracking } from '@/lib/data/queries/order-tracking'
import { APP_NAME } from '@/lib/constants/brand'
import { Package, Truck, CheckCircle, Clock, ExternalLink } from 'lucide-react'

interface PageProps {
  params: Promise<{ token: string }>
}

function formatDate(date: Date | null): string {
  if (!date) return 'N/A'
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function getStatusStep(status: string): number {
  switch (status) {
    case 'Pending':
      return 1
    case 'Processing':
      return 2
    case 'Partially Shipped':
      return 3
    case 'Shipped':
      return 4
    case 'Invoiced':
      return 5
    default:
      return 1
  }
}

function StatusStepper({ status }: { status: string }) {
  const currentStep = getStatusStep(status)
  const steps = [
    { label: 'Placed', step: 1 },
    { label: 'Processing', step: 2 },
    { label: 'Shipped', step: 3 },
    { label: 'Complete', step: 4 },
  ]

  // Map current status to stepper step
  const activeStep = Math.min(currentStep, 4)

  return (
    <div className="flex items-center justify-between w-full max-w-md mx-auto">
      {steps.map((s, index) => (
        <div key={s.step} className="flex items-center">
          <div className="flex flex-col items-center">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors ${
                s.step <= activeStep
                  ? 'bg-green-500 border-green-500 text-white'
                  : 'bg-gray-100 border-gray-300 text-gray-400'
              }`}
            >
              {s.step < activeStep ? (
                <CheckCircle className="h-5 w-5" />
              ) : s.step === activeStep ? (
                <Clock className="h-5 w-5" />
              ) : (
                <span className="text-sm font-medium">{s.step}</span>
              )}
            </div>
            <span
              className={`text-xs mt-2 ${
                s.step <= activeStep ? 'text-gray-900 font-medium' : 'text-gray-400'
              }`}
            >
              {s.label}
            </span>
          </div>
          {index < steps.length - 1 && (
            <div
              className={`h-0.5 w-12 mx-2 ${
                s.step < activeStep ? 'bg-green-500' : 'bg-gray-200'
              }`}
            />
          )}
        </div>
      ))}
    </div>
  )
}

function ShipmentCard({
  shipment,
  totalShipments,
}: {
  shipment: PublicOrderTracking['shipments'][0]
  totalShipments: number
}) {
  return (
    <div className="border rounded-lg bg-white shadow-sm overflow-hidden">
      <div className="bg-gray-50 px-4 py-3 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Truck className="h-5 w-5 text-gray-500" />
          <span className="font-medium">
            Shipment {shipment.shipmentNumber} of {totalShipments}
          </span>
        </div>
        <span className="text-sm text-gray-500">
          Shipped {formatDate(shipment.shipDate)}
        </span>
      </div>

      <div className="p-4">
        {/* Tracking Info */}
        {shipment.trackingNumber && (
          <div className="mb-4 p-3 bg-blue-50 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">
                  <span className="font-medium">{shipment.carrier}:</span>{' '}
                  {shipment.trackingNumber}
                </p>
              </div>
              {shipment.trackingUrl && (
                <a
                  href={shipment.trackingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-800"
                >
                  Track Package
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          </div>
        )}

        {/* Items */}
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-2">Items in this shipment:</h4>
          <ul className="space-y-2">
            {shipment.items.map((item, idx) => (
              <li key={idx} className="flex items-center gap-3 text-sm">
                <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">
                  {item.sku}
                </span>
                <span className="text-gray-600 flex-1">{item.productName}</span>
                <span className="font-medium">×{item.quantity}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

export default async function TrackingPage({ params }: PageProps) {
  const { token } = await params

  // Verify token
  const tokenData = verifyTrackingToken(token)
  if (!tokenData) {
    notFound()
  }

  // Get order tracking data
  const tracking = await getPublicOrderTracking(tokenData.orderId, tokenData.email)
  if (!tracking) {
    notFound()
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <Package className="h-8 w-8 text-primary" />
            <span className="text-xl font-bold">{APP_NAME}</span>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-4 py-8">
        {/* Order Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Order Tracking</h1>
          <p className="text-gray-600">
            Order <span className="font-semibold">{tracking.orderNumber}</span> for{' '}
            <span className="font-semibold">{tracking.storeName}</span>
          </p>
          <p className="text-sm text-gray-500 mt-1">
            Placed on {formatDate(tracking.orderDate)}
          </p>
        </div>

        {/* Status Stepper */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <StatusStepper status={tracking.status} />
        </div>

        {/* Order Summary */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Order Summary</h2>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-2xl font-bold text-gray-900">{tracking.itemsOrdered}</p>
              <p className="text-sm text-gray-500">Items Ordered</p>
            </div>
            <div className="p-4 bg-green-50 rounded-lg">
              <p className="text-2xl font-bold text-green-600">{tracking.itemsShipped}</p>
              <p className="text-sm text-gray-500">Items Shipped</p>
            </div>
            {tracking.itemsCancelled > 0 && (
              <div className="p-4 bg-red-50 rounded-lg">
                <p className="text-2xl font-bold text-red-600">{tracking.itemsCancelled}</p>
                <p className="text-sm text-gray-500">Items Cancelled</p>
              </div>
            )}
          </div>
        </div>

        {/* Shipments */}
        {tracking.shipments.length > 0 ? (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">
              Shipments ({tracking.shipments.length})
            </h2>
            {tracking.shipments.map((shipment) => (
              <ShipmentCard
                key={shipment.shipmentNumber}
                shipment={shipment}
                totalShipments={tracking.totalShipments}
              />
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm p-8 text-center">
            <Package className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-600">No shipments yet. We&apos;ll update you when your order ships.</p>
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-gray-500">
          <p>
            Questions about your order?{' '}
            <a href="mailto:orders@limeapple.com" className="text-primary hover:underline">
              Contact us
            </a>
          </p>
        </div>
      </main>
    </div>
  )
}
