first sync with github - pull and merge

then checkout a new branch for the feature

when done with code changes, prepare the prisma/db changes that are needed, prepare the script and give me the commands for what to do after I open the tunnel

then we will git commit and push

then I will test the changes locally

then we will debug if needed

---

## SQL Migration Rules (IMPORTANT)

The `npm run apply-migration` script uses `prisma db execute` which has limitations:

### DO NOT use `GO` batch separators
- `GO` is a SQL Server Management Studio / sqlcmd command, NOT valid SQL
- Prisma will fail with cryptic errors if you include `GO`

### Split dependent statements into separate migrations
When you have statements that depend on previous DDL changes (e.g., creating an index on a newly-added column), you MUST split them into separate migration files:

**BAD (will fail):**
```sql
-- Single file with dependent statements
ALTER TABLE CustomerOrders ADD NewColumn DATETIME NULL;
CREATE INDEX IX_NewColumn ON CustomerOrders(NewColumn);  -- FAILS: column not visible yet
```

**GOOD (will work):**
```sql
-- File 011_add_column.sql
ALTER TABLE CustomerOrders ADD NewColumn DATETIME NULL;
```

```sql
-- File 012_add_index.sql (separate file, run after 011)
CREATE INDEX IX_NewColumn ON CustomerOrders(NewColumn);
```

### Migration workflow
1. Create migration file(s) in `sql/migrations/`
2. Open tunnel: `npm run db:tunnel`
3. Apply migration: `npm run apply-migration sql/migrations/XXX.sql`
4. Regenerate Prisma: `npx prisma db pull && npx prisma generate`