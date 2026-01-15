/**
 * Shipment Documents Queries
 * 
 * Query functions for retrieving shipment document metadata.
 */

import { prisma } from '@/lib/prisma'
import type { DocumentType, StoredDocument } from '@/lib/storage/document-storage'

export interface ShipmentDocumentSummary {
  shipmentId: string
  orderNumber: string
  shipDate: Date | null
  documents: {
    packingSlip: StoredDocument | null
    invoice: StoredDocument | null
  }
}

/**
 * Get document summary for all shipments of an order
 */
export async function getOrderShipmentDocuments(
  orderId: string
): Promise<ShipmentDocumentSummary[]> {
  const shipments = await prisma.shipments.findMany({
    where: {
      CustomerOrderID: BigInt(orderId),
    },
    include: {
      ShipmentDocuments: true,
      CustomerOrders: {
        select: {
          OrderNumber: true,
        },
      },
    },
    orderBy: {
      CreatedAt: 'asc',
    },
  })

  return shipments.map((shipment) => {
    const packingSlipDoc = shipment.ShipmentDocuments.find(
      (d) => d.DocumentType === 'packing_slip'
    )
    const invoiceDoc = shipment.ShipmentDocuments.find(
      (d) => d.DocumentType === 'shipping_invoice'
    )

    const mapDoc = (doc: typeof packingSlipDoc): StoredDocument | null => {
      if (!doc) return null
      return {
        id: doc.ID.toString(),
        documentNumber: doc.DocumentNumber,
        documentType: doc.DocumentType as DocumentType,
        fileName: doc.FileName,
        filePath: doc.FilePath,
        fileSize: doc.FileSize || 0,
        generatedAt: doc.GeneratedAt,
        generatedBy: doc.GeneratedBy,
        sentToCustomer: doc.SentToCustomer,
        sentAt: doc.SentAt,
      }
    }

    return {
      shipmentId: shipment.ID.toString(),
      orderNumber: shipment.CustomerOrders.OrderNumber,
      shipDate: shipment.ShipDate,
      documents: {
        packingSlip: mapDoc(packingSlipDoc),
        invoice: mapDoc(invoiceDoc),
      },
    }
  })
}

/**
 * Get a single document by document number
 */
export async function getDocumentByNumber(
  documentNumber: string
): Promise<StoredDocument | null> {
  const doc = await prisma.shipmentDocuments.findFirst({
    where: {
      DocumentNumber: documentNumber,
    },
  })

  if (!doc) return null

  return {
    id: doc.ID.toString(),
    documentNumber: doc.DocumentNumber,
    documentType: doc.DocumentType as DocumentType,
    fileName: doc.FileName,
    filePath: doc.FilePath,
    fileSize: doc.FileSize || 0,
    generatedAt: doc.GeneratedAt,
    generatedBy: doc.GeneratedBy,
    sentToCustomer: doc.SentToCustomer,
    sentAt: doc.SentAt,
  }
}

/**
 * Get recent documents across all orders (for admin dashboard)
 */
export async function getRecentDocuments(
  limit: number = 20
): Promise<
  Array<
    StoredDocument & {
      orderNumber: string
      storeName: string
    }
  >
> {
  const docs = await prisma.shipmentDocuments.findMany({
    take: limit,
    orderBy: {
      GeneratedAt: 'desc',
    },
    include: {
      Shipment: {
        include: {
          CustomerOrders: {
            select: {
              OrderNumber: true,
              StoreName: true,
            },
          },
        },
      },
    },
  })

  return docs.map((doc) => ({
    id: doc.ID.toString(),
    documentNumber: doc.DocumentNumber,
    documentType: doc.DocumentType as DocumentType,
    fileName: doc.FileName,
    filePath: doc.FilePath,
    fileSize: doc.FileSize || 0,
    generatedAt: doc.GeneratedAt,
    generatedBy: doc.GeneratedBy,
    sentToCustomer: doc.SentToCustomer,
    sentAt: doc.SentAt,
    orderNumber: doc.Shipment.CustomerOrders.OrderNumber,
    storeName: doc.Shipment.CustomerOrders.StoreName,
  }))
}

/**
 * Get documents pending send to customer
 */
export async function getPendingDocuments(): Promise<StoredDocument[]> {
  const docs = await prisma.shipmentDocuments.findMany({
    where: {
      SentToCustomer: false,
      DocumentType: 'shipping_invoice', // Only invoices need to be sent
    },
    orderBy: {
      GeneratedAt: 'asc',
    },
  })

  return docs.map((doc) => ({
    id: doc.ID.toString(),
    documentNumber: doc.DocumentNumber,
    documentType: doc.DocumentType as DocumentType,
    fileName: doc.FileName,
    filePath: doc.FilePath,
    fileSize: doc.FileSize || 0,
    generatedAt: doc.GeneratedAt,
    generatedBy: doc.GeneratedBy,
    sentToCustomer: doc.SentToCustomer,
    sentAt: doc.SentAt,
  }))
}

/**
 * Count documents by type for analytics
 */
export async function getDocumentCounts(): Promise<{
  packingSlips: number
  invoices: number
  totalSize: number
}> {
  const [packingSlips, invoices, sizeResult] = await Promise.all([
    prisma.shipmentDocuments.count({
      where: { DocumentType: 'packing_slip' },
    }),
    prisma.shipmentDocuments.count({
      where: { DocumentType: 'shipping_invoice' },
    }),
    prisma.shipmentDocuments.aggregate({
      _sum: { FileSize: true },
    }),
  ])

  return {
    packingSlips,
    invoices,
    totalSize: sizeResult._sum.FileSize || 0,
  }
}
