#!/usr/bin/env node
/**
 * Run SQL migration script
 * Usage: node scripts/run-migration.js <migration-file>
 * Example: node scripts/run-migration.js sql-migrations/add-ispreorder-column.sql
 */

const sql = require('mssql');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  const migrationFile = process.argv[2];
  
  if (!migrationFile) {
    console.error('Usage: node scripts/run-migration.js <migration-file>');
    console.error('Example: node scripts/run-migration.js sql-migrations/add-ispreorder-column.sql');
    process.exit(1);
  }

  const filePath = path.resolve(process.cwd(), migrationFile);
  
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  // Parse DATABASE_URL from environment
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL environment variable not set');
    process.exit(1);
  }

  // Parse connection string - supports two formats:
  // Format 1: sqlserver://user:pass@host:port;database=dbname;...
  // Format 2: sqlserver://host:port;database=dbname;user=user;password=pass;...
  let server, port, database, user, password;
  
  const format1 = dbUrl.match(/sqlserver:\/\/([^:]+):([^@]+)@([^:]+):(\d+);database=([^;]+)/i);
  const format2 = dbUrl.match(/sqlserver:\/\/([^:;]+):(\d+);database=([^;]+);user=([^;]+);password=([^;]+)/i);
  
  if (format1) {
    [, user, password, server, port, database] = format1;
  } else if (format2) {
    [, server, port, database, user, password] = format2;
  } else {
    console.error('Could not parse DATABASE_URL');
    console.error('Expected format: sqlserver://host:port;database=dbname;user=user;password=pass;...');
    process.exit(1);
  }

  const config = {
    server,
    port: parseInt(port, 10),
    database,
    user,
    password,
    options: {
      encrypt: true,
      trustServerCertificate: true,
    },
  };

  console.log(`\nConnecting to ${server}:${port}/${database}...`);
  
  let pool;
  try {
    pool = await sql.connect(config);
    console.log('Connected successfully.\n');

    // Read and execute migration
    const script = fs.readFileSync(filePath, 'utf8');
    console.log(`Running migration: ${migrationFile}\n`);
    console.log('─'.repeat(50));
    
    // Split by GO statements and execute each batch
    const batches = script.split(/^\s*GO\s*$/im).filter(b => b.trim());
    
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i].trim();
      if (batch) {
        try {
          const result = await pool.request().query(batch);
          if (result.recordset && result.recordset.length > 0) {
            console.table(result.recordset);
          }
        } catch (batchErr) {
          console.error(`Error in batch ${i + 1}:`, batchErr.message);
          throw batchErr;
        }
      }
    }

    console.log('─'.repeat(50));
    console.log('\n✓ Migration completed successfully!\n');
    
  } catch (err) {
    console.error('\n✗ Migration failed:', err.message);
    process.exit(1);
  } finally {
    if (pool) {
      await pool.close();
    }
  }
}

runMigration();
