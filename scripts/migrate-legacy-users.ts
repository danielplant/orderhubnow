/**
 * Migrate legacy users to secure password system
 *
 * This script:
 * 1. Finds all users with Status = 'legacy' and a plaintext Password
 * 2. Hashes their plaintext password → PasswordHash (bcrypt)
 * 3. Syncs LoginID and Email to match
 * 4. Sets Status = 'active'
 * 5. Clears the plaintext Password field
 *
 * Usage:
 *   npx tsx scripts/migrate-legacy-users.ts --dry-run   # Preview changes
 *   npx tsx scripts/migrate-legacy-users.ts --execute   # Run migration
 */

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()
const COST_FACTOR = 12

async function migrate(dryRun: boolean) {
  console.log(dryRun ? '\n=== DRY RUN (no changes) ===' : '\n=== EXECUTING MIGRATION ===')

  // Find all legacy users with plaintext passwords
  const legacyUsers = await prisma.users.findMany({
    where: {
      Status: 'legacy',
    },
    select: {
      ID: true,
      LoginID: true,
      Email: true,
      Password: true,
      PasswordHash: true,
      Status: true,
    },
  })

  console.log(`\nFound ${legacyUsers.length} legacy users to migrate:\n`)

  let migrated = 0
  let skipped = 0
  let errors = 0

  for (const user of legacyUsers) {
    // Skip if no plaintext password and no existing hash
    if (!user.Password && !user.PasswordHash) {
      console.log(`  [SKIP] ID ${user.ID} (${user.LoginID}) - No password set`)
      skipped++
      continue
    }

    // If already has PasswordHash but no plaintext, just update status and sync emails
    const hasHashOnly = !user.Password && user.PasswordHash

    // Determine the canonical email (prefer Email, fallback to LoginID)
    const canonicalEmail = user.Email || user.LoginID

    if (!canonicalEmail) {
      console.log(`  [ERROR] ID ${user.ID} - No email or LoginID`)
      errors++
      continue
    }

    console.log(`  [MIGRATE] ID ${user.ID}`)
    console.log(`    LoginID: "${user.LoginID}" → "${canonicalEmail}"`)
    console.log(`    Email:   "${user.Email}" → "${canonicalEmail}"`)
    if (hasHashOnly) {
      console.log(`    Password: (already hashed)`)
    } else {
      console.log(`    Password: (plaintext ${user.Password?.length || 0} chars) → (bcrypt hash)`)
    }
    console.log(`    Status: legacy → active`)
    console.log('')

    if (!dryRun) {
      try {
        const updateData: {
          LoginID: string
          Email: string
          PasswordHash?: string
          Password: null
          Status: string
        } = {
          LoginID: canonicalEmail,
          Email: canonicalEmail,
          Password: null, // Clear plaintext
          Status: 'active',
        }

        // Only hash if there's a plaintext password to hash
        if (user.Password) {
          updateData.PasswordHash = await bcrypt.hash(user.Password, COST_FACTOR)
        }

        await prisma.users.update({
          where: { ID: user.ID },
          data: updateData,
        })

        migrated++
      } catch (err) {
        console.log(`  [ERROR] ID ${user.ID} - ${err}`)
        errors++
      }
    } else {
      migrated++
    }
  }

  console.log(`\n=== Summary ===`)
  console.log(`  Migrated: ${migrated}`)
  console.log(`  Skipped:  ${skipped}`)
  console.log(`  Errors:   ${errors}`)

  if (dryRun) {
    console.log(`\nThis was a dry run. Run with --execute to apply changes.`)
  } else {
    console.log(`\nMigration complete!`)
    console.log(`\nNext steps:`)
    console.log(`  1. Test login for a few migrated users`)
    console.log(`  2. Remove legacy code path from src/lib/auth/config.ts (lines 84-92)`)
  }
}

// Main
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const execute = args.includes('--execute')

if (!dryRun && !execute) {
  console.log('Migrate Legacy Users to Secure Password System')
  console.log('='.repeat(50))
  console.log('')
  console.log('Usage:')
  console.log('  npx tsx scripts/migrate-legacy-users.ts --dry-run   # Preview changes')
  console.log('  npx tsx scripts/migrate-legacy-users.ts --execute   # Run migration')
  console.log('')
  console.log('This script will:')
  console.log('  1. Hash plaintext passwords → PasswordHash (bcrypt)')
  console.log('  2. Sync LoginID = Email')
  console.log('  3. Set Status = active')
  console.log('  4. Clear plaintext Password field')
  process.exit(1)
}

migrate(dryRun)
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e)
    prisma.$disconnect()
    process.exit(1)
  })
