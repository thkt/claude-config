# Domain scoping

Referenced from /research Phase 4. Read it only when Phase 3 settled a domain other than General.

Pass the roots to Explore in the prompt, add the words to ugrep and bfs, and start Read from the roots. When every glob root of the target domain is absent, fall back to General and let Explore find it with no scoping applied.

| Domain         | Glob roots                                                      | Domain words                    |
| -------------- | --------------------------------------------------------------- | ------------------------------- |
| Data model     | `schema/`, `models/`, `db/`, `drizzle/`, `prisma/`, `*.sql`     | model, migration, table, column |
| API            | `routes/`, `handlers/`, `controllers/`, `api/`, `server/`       | endpoint, route, handler        |
| Infrastructure | `terraform/`, `infra/`, `ci/`, `.github/`, `deploy/`, `docker/` | pipeline, deploy, provision     |
