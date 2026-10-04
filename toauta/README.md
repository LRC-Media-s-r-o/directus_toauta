# ToAuta deployment of Directus

This branch (`toauta`) is the source that Dokploy deploys to `https://directus.toauta.cz`. It is the upstream release tag `v12.3.1` plus this `toauta/` folder, and nothing else. No upstream source file is modified, and production does not build the monorepo.

The image is the official `directus/directus:12.3.1`, pinned by digest, with two extensions baked in:
- `directus-extension-display-car-images` shows `cars.images` (a Postgres `text[]` of photo URLs) as thumbnails in list views and on the item page. It is view-only.
- `directus-extension-hook-car-write-contract` is the server-side write contract for `cars`. See [Car write contract](#car-write-contract).

## Layout

| Path | Purpose |
| --- | --- |
| `docker-compose.yml` | The compose file Dokploy runs. It matches the previous raw compose except for the 3 changes listed below. |
| `Dockerfile` | Builds the extension in a Node stage, then copies `package.json` and `dist/` into the official image under `/directus/extensions/`. |
| `.dockerignore` | Allowlist for the build context. Dokploy writes the deployment `.env`, which holds secrets, next to `docker-compose.yml`. The allowlist keeps it out of the build. |
| `extensions/directus-extension-display-car-images/` | Extension source: `package.json`, `package-lock.json`, `tsconfig.json`, `postcss.config.mjs` and `src/`. `node_modules/` and `dist/` are never committed. |
| `extensions/directus-extension-hook-car-write-contract/` | Hook source: `package.json`, `package-lock.json` and `src/` (`contract.mjs` holds the rules, `contract.test.mjs` the unit tests, `index.js` the Directus wiring). `node_modules/` and `dist/` are never committed. This folder is the only copy. |

Changes compared with the previous raw compose:
1. The `directus` service has `build: { context: ., dockerfile: Dockerfile }` and the local tag `image: toauta-directus-car-images:12.3.1`, instead of `image: directus/directus:12.3.1`.
2. The `directus_extensions:/directus/extensions` mount and its top-level volume declaration are removed. A non-empty volume there would hide the baked-in extension. The Docker volume itself is not deleted.
3. `CONTENT_SECURITY_POLICY_DIRECTIVES__IMG_SRC` allows the two photo hosts. It lists every source, defaults included, because a single value replaces the default list and drops `'self'`, `data:` and `blob:`. If a new image host appears in `cars.images`, add it here.

All secrets stay in the Dokploy environment and are referenced as `${VAR}`. This repository is public, so never commit a literal secret.

## Dokploy settings

Compose `directus` in project `Auto_ToHledej`, environment `production`:

| Setting | Value |
| --- | --- |
| Source type | Git (`sourceType: "git"`) |
| Repository URL | `https://github.com/LRC-Media-s-r-o/directus_toauta.git` (public, no SSH key) |
| Branch | `toauta` |
| Compose path | `./toauta/docker-compose.yml` |
| Compose type | `docker-compose` |
| Domain | `directus.toauta.cz` → service `directus`, port `8055`, HTTPS |
| Environment | Unchanged. Dokploy writes it to `toauta/.env` at deploy time. |

On deploy, Dokploy clones the branch with `--depth 1`, then runs `docker compose -p <appName> -f ./toauta/docker-compose.yml up -d --build --remove-orphans`. The build needs Docker Hub and the npm registry. The old container keeps serving during the build. Then only the `directus` container is recreated. Expect about 1 minute of downtime for the Directus boot.

There is no webhook from this repository to Dokploy, so a push does not deploy by itself. Deploy from the Dokploy UI or with `compose.deploy`.

## Car write contract

`directus-extension-hook-car-write-contract` registers three filters: `cars.items.update`, `cars.items.create` and `cars.items.delete`. Filters run inside Directus' `ItemsService` before the write, for admins too. A rejection answers HTTP 400 `INVALID_PAYLOAD` with a Czech message, and `extensions.rule` and `extensions.fields` say which rule and which fields. The row is not changed.

Why it exists: Directus connects to Postgres as `postgres` with no JWT, so the app's bookkeeping does not run for Directus edits. Without the hook, an edit of an imported car can be reverted by the next import, or can break the import's state.

Rules (the full field matrix is in the app repository, `.omo/evidence/visual-admin-panel/task-17.md`):
- **Every car:**
  - Provenance and identity columns can't be written: `id`, `owner_id`, `source_*`, `local_override_fields` and `import_job_id`.
  - Computed or lifecycle columns can't be written: timestamps, `is_on_sale`, view counters, media cleanup, `sold_at`, `sold_origin`, `needs_attention`, `attention_reasons`, `import_unmatched_equipment_count`, `location_inherited_from_profile`, `max_photos_allowed` and `seller`.
  - Location columns and `images` can't be written either.
- **Imported cars from `autocaris` or `http_post` (not deleted at source):** only the 56 content columns in `IMPORT_OVERRIDE_FIELDS` can be written. The hook adds each written column name to `local_override_fields` in the same `UPDATE`. The app's importer (`applyLocalOverrides` in `lib/imports/import-service.ts`) then leaves those columns alone on every later import. This is permanent, because the database trigger `a0_cars_union_local_override_fields` only ever adds markers. Before it writes markers, the hook checks that this trigger is enabled. If it isn't, the write fails with 503. `is_published`, `sale_status` and all other columns are rejected.
- **`sauto_xmlrpc` cars, and manual cars with a SAUTO XML-RPC alias:** every edit is rejected. The dealer's next push rewrites the car and ignores `local_override_fields`.
- **Cars deleted at source (`source_deleted = true`), and cars with an unknown `source_system`:** every edit is rejected.
- **Manual cars:** everything else can be edited, with no override bookkeeping. `sale_status` may only move between `available` and `reserved`. A sold car can't be published.
- **Bulk edits:** an edit that mixes manual and imported cars is rejected.
- **Create:** only manual cars, without import data.
- **Delete:** only plain manual cars.

Known gaps:
- Flows with "emit events" turned off, and content-version promotion, skip filters.
- An admin with SQL access can bypass the hook. It is a guard against mistakes, not a security boundary.

To change the rules:
1. Edit `src/contract.mjs`.
2. Run `npm ci`, `npm test` and `npm run build` in the hook folder.
3. Rebuild the image. The Docker build runs the tests too.

## Changing the car-images extension

The extension's working copy lives in the ToAuta app repository, under `directus/extensions/directus-extension-display-car-images/`. That copy has the full documentation and tests.

1. Change and test it there: `npm ci`, `npm test`, `npm run build`.
2. Copy the source files into `toauta/extensions/directus-extension-display-car-images/`: `package.json`, `package-lock.json`, `.gitignore`, `.dockerignore`, `postcss.config.mjs`, `tsconfig.json` and `src/`. Don't copy `node_modules/` or `dist/`.
3. Check the image locally from the repository root:

   ```powershell
   docker build -t toauta-directus-car-images:test toauta
   docker run --rm --entrypoint ls toauta-directus-car-images:test -la /directus/extensions/directus-extension-display-car-images/dist
   ```

4. Commit on `toauta`, push, and deploy in Dokploy.
5. Verify as shown below.

The build runs the unit tests and fails if `dist/app.js` or `dist/api.js` is empty.

## Verifying a deploy

- `GET /server/ping` returns `pong`.
- As an admin, `GET /server/info` reports version `12.3.1`, and `GET /server/health` is `ok`, including Redis.
- As an admin, `GET /extensions` lists `directus-extension-display-car-images` with `schema.type: "bundle"`, plus `car-images-display` (display) and `car-images-interface` (interface). It also lists `directus-extension-hook-car-write-contract` with `schema.type: "hook"` and `meta.enabled: true`. Check `schema.type`, not only the count: rows in `directus_extensions` survive even when the files are missing.
- The hook is live: as an admin, `PATCH /items/cars/<id of an imported car>` with `{"source_system": "<its current value>"}` returns 400, with `extensions.rule` set to `provenance_field`. This probe changes no data, because the value is the same.
- The `Content-Security-Policy` header's `img-src` contains both photo hosts and still contains `'self' data: blob:`.

## Version policy

Production stays on Directus `12.3.1`. Never merge upstream `main` into this branch and never deploy `main`. A newer Directus runs database migrations on start.

To upgrade:
1. Create a new branch from the newer upstream tag, for example `git switch -c toauta-12.x.y v12.x.y`, and copy `toauta/` into it.
2. Update the `FROM` tag and digest, `@directus/extensions-sdk` (the version released with that Directus), the extension's `host` range, and the tag in `docker-compose.yml`.
3. Rehearse locally first: boot the new image against a copy of the production database, run the migrations, and test the admin app and the extension.
4. Run the migrations against production with the full-privilege database user, in a planned window, with a fresh database backup.
5. Point Dokploy at the new branch and deploy. Keep the old branch for rollback until the new version is verified. Rolling back across migrations also needs the database restored.

## Rollback

To remove only the write-contract hook:
1. Run `git revert <commit>` on `toauta` and push.
2. Deploy (`compose.deploy`).
3. Check that `GET /extensions` no longer lists the hook.

The hook stores nothing of its own. The `local_override_fields` markers it already wrote stay, and the importer keeps honouring them.

The previous setup was a raw compose in Dokploy using `image: directus/directus:12.3.1` with the `directus_extensions` volume. A copy of that raw compose is kept with the deployment evidence in the ToAuta app repository: `.omo/evidence/visual-admin-panel/directus-compose-original.yml`. It contains only `${VAR}` references, no secrets.

1. Call `compose.update` for the compose with `sourceType: "raw"`, `composeFile` set to the previous raw compose, `composePath: "./docker-compose.yml"`, `customGitUrl: null` and `customGitBranch: null`. Leave the environment, domains and other settings as they are.
2. Deploy (`compose.deploy`).
3. Check `GET /server/ping` and that `GET /server/info` reports `12.3.1`.

The same steps work in the Dokploy UI: switch the provider to Raw, paste the previous compose, save and deploy. Without the extension, lists show `cars.images` as raw URL text, and the item page shows only the field's label and note. That is safe, and nothing can be edited there. To also restore the field display, set `interface`, `display` and `display_options` of `cars.images` back to `null` and `readonly` to `false`.
