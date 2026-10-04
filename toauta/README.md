# ToAuta deployment of Directus

This branch (`toauta`) is the source that Dokploy deploys to `https://directus.toauta.cz`. It is the upstream release tag `v12.3.1` plus this `toauta/` folder, and nothing else. No upstream source file is modified, and production does not build the monorepo.

The image is the official `directus/directus:12.3.1`, pinned by digest, with one extension baked in: `directus-extension-display-car-images`. It shows `cars.images` (a Postgres `text[]` of photo URLs) as thumbnails in list views and on the item page, and it is view-only.

## Layout

| Path | Purpose |
| --- | --- |
| `docker-compose.yml` | The compose file Dokploy runs. It matches the previous raw compose except for the 3 changes listed below. |
| `Dockerfile` | Builds the extension in a Node stage, then copies `package.json` and `dist/` into the official image under `/directus/extensions/`. |
| `.dockerignore` | Allowlist for the build context. Dokploy writes the deployment `.env`, which holds secrets, next to `docker-compose.yml`. The allowlist keeps it out of the build. |
| `extensions/directus-extension-display-car-images/` | Extension source: `package.json`, `package-lock.json`, `tsconfig.json`, `postcss.config.mjs` and `src/`. `node_modules/` and `dist/` are never committed. |

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

## Changing the extension

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
- As an admin, `GET /extensions` lists `directus-extension-display-car-images` with `schema.type: "bundle"`, plus `car-images-display` (display) and `car-images-interface` (interface). Check `schema.type`, not only the count: rows in `directus_extensions` survive even when the files are missing.
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

The previous setup was a raw compose in Dokploy using `image: directus/directus:12.3.1` with the `directus_extensions` volume. A copy of that raw compose is kept with the deployment evidence in the ToAuta app repository: `.omo/evidence/visual-admin-panel/directus-compose-original.yml`. It contains only `${VAR}` references, no secrets.

1. Call `compose.update` for the compose with `sourceType: "raw"`, `composeFile` set to the previous raw compose, `composePath: "./docker-compose.yml"`, `customGitUrl: null` and `customGitBranch: null`. Leave the environment, domains and other settings as they are.
2. Deploy (`compose.deploy`).
3. Check `GET /server/ping` and that `GET /server/info` reports `12.3.1`.

The same steps work in the Dokploy UI: switch the provider to Raw, paste the previous compose, save and deploy. Without the extension, lists show `cars.images` as raw URL text, and the item page shows only the field's label and note. That is safe, and nothing can be edited there. To also restore the field display, set `interface`, `display` and `display_options` of `cars.images` back to `null` and `readonly` to `false`.
