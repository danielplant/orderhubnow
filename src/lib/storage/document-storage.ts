/**
 * Document Storage Service
 * 
 * Handles storage and retrieval of shipment documents (packing slips, invoices).
 * Uses S3 for production storage with local filesystem fallback for development.
 */

import { uploadToS3, deleteFromS3 } from '@/lib/s3'
import { prisma } from '@/lib/prisma'
import fs from 'fs/promises'
import path from 'path'

export type DocumentType = 'packing_slip' | 'shipping_invoice'

export interface DocumentMetadata {
  shipmentId: string
  orderId: string
  orderNumber: string
  documentType: DocumentType
  shipmentNumber: number
  generatedBy?: string
}

export interface StoredDocument {
  id: string
  documentNumber: string
  documentType: DocumentType
  fileName: string
  filePath: string
  fileSize: number
  generatedAt: Date
  generatedBy: string | null
  sentToCustomer: boolean
  sentAt: Date | null
}

const USE_S3 = !!process.env.AWS_S3_BUCKET_NAME
const LOCAL_STORAGE_PATH = process.env.DOCUMENT_STORAGE_PATH || './storage/documents'

/**
 * Generate a unique document number
 * Format: PS-{OrderNumber}-{ShipmentNumber} or INV-{OrderNumber}-{ShipmentNumber}
 */
export function generateDocumentNumber(
  documentType: DocumentType,
  orderNumber: string,
  shipmentNumber: number
): string {
  const prefix = documentType === 'packing_slip' ? 'PS' : 'INV'
  return `${prefix}-${orderNumber}-${shipmentNumber}`
}

/**
 * Get the storage path for a document
 */
function getStoragePath(
  orderId: string,
  shipmentId: string,
  documentNumber: string
): string {
  return `shipments/${orderId}/${shipmentId}/${documentNumber}.pdf`
}

/**
 * Store a document (PDF buffer) and record metadata in database
 */
export async function storeDocument(
  pdfBuffer: Buffer,
  metadata: DocumentMetadata
): Promise<StoredDocument> {
  const documentNumber = generateDocumentNumber(
    metadata.documentType,
    metadata.orderNumber,
    metadata.shipmentNumber
  )
  const fileName = `${documentNumber}.pdf`
  const storagePath = getStoragePath(
    metadata.orderId,
    metadata.shipmentId,
    documentNumber
  )

  let filePath: string

  if (USE_S3) {
    // Store in S3
    filePath = await uploadToS3(pdfBuffer, storagePath, 'application/pdf')
  } else {
    // Store locally for development
    const fullPath = path.join(LOCAL_STORAGE_PATH, storagePath)
    await fs.mkdir(path.dirname(fullPath), { recursive: true })
    await fs.writeFile(fullPath, pdfBuffer)
    filePath = storagePath
  }

  // Record in database
  const doc = await prisma.shipmentDocuments.create({
    data: {
      ShipmentID: BigInt(metadata.shipmentId),
      OrderID: BigInt(metadata.orderId),
      DocumentType: metadata.documentType,
      DocumentNumber: documentNumber,
      FileName: fileName,
      FilePath: filePath,
      FileSize: pdfBuffer.length,
      MimeType: 'application/pdf',
      GeneratedBy: metadata.generatedBy,
    },
  })

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
 * Retrieve a document by shipment ID and type
 */
export async function getDocument(
  shipmentId: string,
  documentType: DocumentType
): Promise<Buffer | null> {
  const doc = await prisma.shipmentDocuments.findFirst({
    where: {
      ShipmentID: BigInt(shipmentId),
      DocumentType: documentType,
    },
  })

  if (!doc) return null

  if (USE_S3) {
    // For S3, the filePath is the full URL - we need to fetch it
    const response = await fetch(doc.FilePath)
    if (!response.ok) return null
    return Buffer.from(await response.arrayBuffer())
  } else {
    // Read from local storage
    const fullPath = path.join(LOCAL_STORAGE_PATH, doc.FilePath)
    try {
      return await fs.readFile(fullPath)
    } catch {
      return null
    }
  }
}

/**
 * Get document metadata by shipment ID
 */
export async function getDocumentMetadata(
  shipmentId: string,
  documentType: DocumentType
): Promise<StoredDocument | null> {
  const doc = await prisma.shipmentDocuments.findFirst({
    where: {
      ShipmentID: BigInt(shipmentId),
      DocumentType: documentType,
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
 * Get all documents for a shipment
 */
export async function getShipmentDocuments(
  shipmentId: string
): Promise<StoredDocument[]> {
  const docs = await prisma.shipmentDocuments.findMany({
    where: {
      ShipmentID: BigInt(shipmentId),
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
 * Get all documents for an order
 */
export async function getOrderDocuments(
  orderId: string
): Promise<StoredDocument[]> {
  const docs = await prisma.shipmentDocuments.findMany({
    where: {
      OrderID: BigInt(orderId),
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
 * Mark a document as sent to customer
 */
export async function markDocumentSent(documentId: string): Promise<void> {
  await prisma.shipmentDocuments.update({
    where: {
      ID: BigInt(documentId),
    },
    data: {
      SentToCustomer: true,
      SentAt: new Date(),
    },
  })
}

/**
 * Delete a document (file and database record)
 */
export async function deleteDocument(documentId: string): Promise<void> {
  const doc = await prisma.shipmentDocuments.findUnique({
    where: {
      ID: BigInt(documentId),
    },
  })

  if (!doc) return

  if (USE_S3) {
    // Delete from S3
    const key = doc.FilePath.replace(/^https:\/\/[^/]+\//, '')
    await deleteFromS3(key)
  } else {
    // Delete from local storage
    const fullPath = path.join(LOCAL_STORAGE_PATH, doc.FilePath)
    try {
      await fs.unlink(fullPath)
    } catch {
      // File may not exist
    }
  }

  await prisma.shipmentDocuments.delete({
    where: {
      ID: BigInt(documentId),
    },
  })
}

/**
 * Check if documents exist for a shipment
 */
export async function hasDocuments(shipmentId: string): Promise<{
  hasPackingSlip: boolean
  hasInvoice: boolean
}> {
  const docs = await prisma.shipmentDocuments.findMany({
    where: {
      ShipmentID: BigInt(shipmentId),
    },
    select: {
      DocumentType: true,
    },
  })

  return {
    hasPackingSlip: docs.some((d) => d.DocumentType === 'packing_slip'),
    hasInvoice: docs.some((d) => d.DocumentType === 'shipping_invoice'),
  }
}
