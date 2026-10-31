# Content Migration

Status: active as of 2026-06-15.

The previous DS and DSA question catalogs are quarantined under
`data/quarantine/intern-2026-06/`. They are not loaded by the app and must not
be copied back into active course files.

Active course content lives only in `data/courses/{ds,dsa}/questions.json`.
Public question fields must be owner-written before release:

- `question_id`
- `question_title`
- `question`
- any public wording introduced in future fields

DS is rebuilt one module or submodule at a time. DSA keeps the owned roadmap
structure, but active questions use owner-controlled ids, titles, and problem
statements.

Before releasing content, run:

```bash
cd web-app
npm run validate:catalog
npm run lint
npm run build
```
