# Subagent DB/Prisma contract

Branch: `feature/<slug>--db`
Scope: prisma/schema.prisma, migrations, query correctness.

Rules:
- Work only on your agent branch.
- If schema changes are needed, modify schema and create migration files.
- Never apply migrations automatically; leave that for master gate.

Deliver:
- commit(s) including migrations
- clear notes describing the migration
