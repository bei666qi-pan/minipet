# GitHub Actions Release Setup

This repository now includes `.github/workflows/desktop-release.yml`. It runs when pushing tags matching `v*` and can also be started manually with `workflow_dispatch`.

## Required Repository Secrets

Configure these in GitHub repository settings under **Settings -> Secrets and variables -> Actions -> Repository secrets**:

```text
VOLCENGINE_ACCESS_KEY_ID
VOLCENGINE_SECRET_ACCESS_KEY
VOLCENGINE_TOS_BUCKET
VOLCENGINE_TOS_REGION
VOLCENGINE_TOS_ENDPOINT
MINIPET_DOWNLOAD_ORIGIN
ADMIN_RELEASE_TOKEN
```

`BACKEND_RELEASE_WEBHOOK_SECRET` can be used instead of `ADMIN_RELEASE_TOKEN`. Use the same value in the backend runtime environment variable.

Do not store these as plain repository files, build variables, release assets, or workflow artifacts.

## Backend Runtime Variable

Set one of these on the deployed backend:

```text
ADMIN_RELEASE_TOKEN=<same value as GitHub secret>
```

or:

```text
BACKEND_RELEASE_WEBHOOK_SECRET=<same value as GitHub secret>
```

The workflow calls:

```text
POST https://api.minipet.versecraft.cn/admin/releases/publish
```

with a bearer token and release manifest payload.

## Tag Release Flow

1. Update `package.json` version.
2. Commit the version bump.
3. Create a matching tag:

```powershell
git tag v0.1.0
git push origin v0.1.0
```

The tag version must match `package.json` without the leading `v`.

## What The Workflow Does

1. Checks out the repository.
2. Sets up Node 22 and pnpm 10.26.1.
3. Runs `pnpm install --frozen-lockfile`.
4. Runs `pnpm run typecheck`.
5. Runs `pnpm test`.
6. Runs `pnpm run build`.
7. Runs `pnpm run dist:win`.
8. Computes SHA256 and size.
9. Creates or updates a draft GitHub Release.
10. Uploads installer and manifests as GitHub Release assets.
11. Uploads installer and latest manifest to Volcengine TOS.
12. Calls the backend release webhook to create the admin release record.

## Security Rules

- The workflow uses `${{ github.token }}` for GitHub Release asset upload.
- Volcengine AK/SK are only passed as step environment variables.
- `ADMIN_RELEASE_TOKEN` or `BACKEND_RELEASE_WEBHOOK_SECRET` is only passed to the backend webhook step.
- The workflow does not echo secret values.
- Release artifacts contain only the installer and JSON manifests; they must not contain API keys, database URLs, JWT secrets, Coolify tokens, or Volcengine credentials.

## Manual Check

After the workflow finishes:

```powershell
curl.exe -fsS https://download.minipet.versecraft.cn/latest/latest.json
curl.exe -I https://download.minipet.versecraft.cn/latest/MiniPetSetup.exe
curl.exe -fsS https://api.minipet.versecraft.cn/health
```

Then open `https://minipet.versecraft.cn` and verify the download button points to the latest installer.
