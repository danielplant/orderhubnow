#!/usr/bin/env node
/**
 * Seed reference tables into local Docker SQL Server
 * Run: node scripts/seed-data/run-seed.js
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function runSeed() {
  const seedFile = path.join(__dirname, 'seed-all.sql');
  
  if (!fs.existsSync(seedFile)) {
    console.error('ERROR: seed-all.sql not found');
    process.exit(1);
  }

  const sql = fs.readFileSync(seedFile, 'utf-8');
  
  // Split by GO statements and execute each batch
  const batches = sql.split(/^\s*GO\s*$/im).filter(b => b.trim());
  
  console.log(`Executing ${batches.length} SQL batches...`);
  
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i].trim();
    if (!batch) continue;
    
    try {
      await prisma.$executeRawUnsafe(batch);
      process.stdout.write('.');
    } catch (err) {
      console.error(`\nError in batch ${i + 1}:`, err.message);
      // Continue with other batches
    }
  }
  
  console.log('\nSeed complete!');
  
  // Verify counts
  const categories = await prisma.skuCategories.count();
  const mainCats = await prisma.skuMainCategory.count();
  const reps = await prisma.reps.count();
  const users = await prisma.users.count();
  
  console.log(`\nSeeded data:`);
  console.log(`  SkuCategories: ${categories}`);
  console.log(`  SkuMainCategory: ${mainCats}`);
  console.log(`  Reps: ${reps}`);
  console.log(`  Users: ${users}`);
}

runSeed()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
