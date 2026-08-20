# ドメインスコープ

/research の Phase 4 から参照する。Phase 3 で General 以外のドメインが決まったときだけ読む。

Explore にはプロンプトでルートを渡し、ugrep と bfs には語を追加し、Read はルートを起点にする。対象ドメインの glob ルートが全て不在なら General にフォールバックし、スコープを掛けずに Explore へ発見させる。

| ドメイン       | glob ルート                                                     | ドメインに沿った語              |
| -------------- | --------------------------------------------------------------- | ------------------------------- |
| Data model     | `schema/`, `models/`, `db/`, `drizzle/`, `prisma/`, `*.sql`     | model, migration, table, column |
| API            | `routes/`, `handlers/`, `controllers/`, `api/`, `server/`       | endpoint, route, handler        |
| Infrastructure | `terraform/`, `infra/`, `ci/`, `.github/`, `deploy/`, `docker/` | pipeline, deploy, provision     |
