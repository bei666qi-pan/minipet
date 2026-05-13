# MiniPet Required Environment

This machine did not have the deployment and model environment variables available during implementation. Do not commit secret values. Configure these in Coolify, GitHub Secrets, or the host environment.

## Required For Production API

- `MINIPET_WEB_ORIGIN=https://minipet.versecraft.cn`
- `MINIPET_API_ORIGIN=https://api.minipet.versecraft.cn`
- `MINIPET_DOWNLOAD_ORIGIN=https://download.minipet.versecraft.cn`
- `NEWAPI_BASE_URL`
- `NEWAPI_API_KEY`
- `NEWAPI_DEFAULT_MODEL`
- `DATABASE_URL`
- `JWT_SECRET`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD_HASH` preferred, or `ADMIN_PASSWORD`
- `ADMIN_RELEASE_TOKEN` or `BACKEND_RELEASE_WEBHOOK_SECRET` for GitHub Actions release publishing

## Required For Windows Installer CDN Upload

- `VOLCENGINE_ACCESS_KEY_ID`
- `VOLCENGINE_SECRET_ACCESS_KEY`
- `VOLCENGINE_TOS_BUCKET`
- `VOLCENGINE_TOS_REGION`
- `VOLCENGINE_TOS_ENDPOINT`
- `VOLCENGINE_CDN_DOMAIN=download.minipet.versecraft.cn`

## Optional Deployment Automation

- `COOLIFY_URL`
- `COOLIFY_TOKEN`
- `COOLIFY_SERVER_ID`
- `GITHUB_TOKEN`

## Notes

- The desktop client defaults to `https://api.minipet.versecraft.cn` and does not need NewAPI credentials.
- NewAPI credentials must only exist on the server side.
- Local development without `DATABASE_URL` uses SQLite at `.runtime-data/backend/minipet.sqlite`; production should use PostgreSQL via `DATABASE_URL`.
- To generate an admin password hash without printing the password, run a local script that imports `hashPassword()` from `apps/backend/src/auth.ts`, then store only the resulting hash in `ADMIN_PASSWORD_HASH`.
