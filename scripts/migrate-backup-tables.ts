/**
 * Migration Script: Sku_backup_* tables → BackupSet/BackupRow
 *
 * This script migrates existing dynamic backup tables to the new normalized
 * backup data model. Run once to migrate, then old tables can be dropped.
 *
 * Usage: npx tsx scripts/migrate-backup-tables.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

interface BackupTableInfo {
  tableName: string
  createdAt: Date
  rowCount: number
}

async function findBackupTables(): Promise<BackupTableInfo[]> {
  // Find all Sku_backup_* tables
  const tables = await prisma.$queryRaw<Array<{ TABLE_NAME: string }>>`
    SELECT TABLE_NAME
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_TYPE = 'BASE TABLE'
      AND TABLE_NAME LIKE 'Sku_backup_%'
    ORDER BY TABLE_NAME
  `

  const backupTables: BackupTableInfo[] = []

  for (const { TABLE_NAME } of tables) {
    // Parse date from table name: Sku_backup_2026_01_16_17_2
    const match = TABLE_NAME.match(/Sku_backup_(\d{4})_(\d{2})_(\d{2})_(\d{2})_(\d+)/)

    let createdAt = new Date()
    if (match) {
      const [, year, month, day, hour] = match
      createdAt = new Date(
        parseInt(year),
        parseInt(month) - 1,
        parseInt(day),
        parseInt(hour)
      )
    }

    // Get row count
    const countResult = await prisma.$queryRawUnsafe<Array<{ cnt: number }>>(
      `SELECT COUNT(*) as cnt FROM [${TABLE_NAME}]`
    )
    const rowCount = countResult[0]?.cnt ?? 0

    backupTables.push({
      tableName: TABLE_NAME,
      createdAt,
      rowCount,
    })
  }

  return backupTables
}

async function migrateTable(tableInfo: BackupTableInfo): Promise<void> {
  console.log(`\nMigrating ${tableInfo.tableName} (${tableInfo.rowCount} rows)...`)

  // Check if already migrated (by looking for a BackupSet with this description)
  const existing = await prisma.backupSet.findFirst({
    where: { description: `Migrated from ${tableInfo.tableName}` },
  })

  if (existing) {
    console.log(`  Already migrated (BackupSet id=${existing.id}), skipping.`)
    return
  }

  // Create the BackupSet
  const backupSet = await prisma.backupSet.create({
    data: {
      backupType: 'Sku',
      description: `Migrated from ${tableInfo.tableName}`,
      rowCount: tableInfo.rowCount,
      createdAt: tableInfo.createdAt,
      createdBy: 'migration-script',
      status: 'active',
    },
  })

  console.log(`  Created BackupSet id=${backupSet.id}`)

  // Fetch all rows from the old table
  // We need to select all columns and convert to JSON
  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT * FROM [${tableInfo.tableName}]`
  )

  console.log(`  Fetched ${rows.length} rows, inserting into BackupRow...`)

  // Insert rows in batches to avoid memory issues
  const batchSize = 500
  let inserted = 0

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)

    await prisma.backupRow.createMany({
      data: batch.map((row) => ({
        backupSetId: backupSet.id,
        rowData: JSON.stringify(row, (key, value) => {
          // Handle BigInt serialization
          if (typeof value === 'bigint') {
            return value.toString()
          }
          // Handle Date serialization
          if (value instanceof Date) {
            return value.toISOString()
          }
          return value
        }),
      })),
    })

    inserted += batch.length
    if (inserted % 1000 === 0 || inserted === rows.length) {
      console.log(`  Inserted ${inserted}/${rows.length} rows`)
    }
  }

  // Update size estimate (rough: average 500 bytes per row)
  await prisma.backupSet.update({
    where: { id: backupSet.id },
    data: { sizeBytes: rows.length * 500 },
  })

  console.log(`  Migration complete for ${tableInfo.tableName}`)
}

async function dropOldTable(tableName: string): Promise<void> {
  console.log(`Dropping old table: ${tableName}`)
  await prisma.$executeRawUnsafe(`DROP TABLE [${tableName}]`)
}

async function main() {
  console.log('='.repeat(60))
  console.log('Backup Table Migration: Sku_backup_* → BackupSet/BackupRow')
  console.log('='.repeat(60))

  try {
    // Step 1: Find all backup tables
    console.log('\n1. Finding existing backup tables...')
    const backupTables = await findBackupTables()

    if (backupTables.length === 0) {
      console.log('   No Sku_backup_* tables found. Nothing to migrate.')
      return
    }

    console.log(`   Found ${backupTables.length} backup tables:`)
    for (const t of backupTables) {
      console.log(`   - ${t.tableName} (${t.rowCount} rows, created ${t.createdAt.toISOString()})`)
    }

    // Step 2: Migrate each table
    console.log('\n2. Migrating tables to BackupSet/BackupRow...')
    for (const tableInfo of backupTables) {
      await migrateTable(tableInfo)
    }

    // Step 3: Drop old tables (only if all migrations succeeded)
    console.log('\n3. Dropping old backup tables...')
    for (const tableInfo of backupTables) {
      await dropOldTable(tableInfo.tableName)
    }

    // Step 4: Verify
    console.log('\n4. Verification...')
    const backupSets = await prisma.backupSet.findMany({
      include: { _count: { select: { rows: true } } },
    })

    console.log(`   Total BackupSets: ${backupSets.length}`)
    for (const bs of backupSets) {
      console.log(`   - id=${bs.id}: ${bs.backupType} (${bs._count.rows} rows, ${bs.status})`)
    }

    // Check no old tables remain
    const remainingTables = await prisma.$queryRaw<Array<{ TABLE_NAME: string }>>`
      SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_TYPE = 'BASE TABLE'
        AND TABLE_NAME LIKE 'Sku_backup_%'
    `

    if (remainingTables.length === 0) {
      console.log('   ✓ All old Sku_backup_* tables have been removed')
    } else {
      console.log(`   ⚠ ${remainingTables.length} old tables still exist:`)
      for (const t of remainingTables) {
        console.log(`     - ${t.TABLE_NAME}`)
      }
    }

    console.log('\n' + '='.repeat(60))
    console.log('Migration complete!')
    console.log('='.repeat(60))
  } catch (error) {
    console.error('\nMigration failed:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()
