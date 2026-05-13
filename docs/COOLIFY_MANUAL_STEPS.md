# MiniPet Coolify Manual Deployment

This document is used when `COOLIFY_URL`, `COOLIFY_TOKEN`, or `COOLIFY_SERVER_ID` are not available locally. Do not paste secrets into Git, build logs, frontend code, or installer artifacts.

## Target URLs

- Website: `https://minipet.versecraft.cn`
- Backend API: `https://api.minipet.versecraft.cn`
- Admin console: `https://minipet.versecraft.cn/admin`

The current Docker service serves all three surfaces from one container:

- `/` -> static website from `apps/website`
- `/admin` -> browser admin console from `apps/admin`
- `/health`, `/v1/*`, `/admin/*` -> backend API from `apps/backend`

Use `https://minipet.versecraft.cn/admin` for admin. Do not configure `admin.minipet.versecraft.cn` unless you add a redirect or reverse-proxy rewrite from `/` to `/admin`.

## 1. DNS

Point these hostnames to the Coolify server or its proxy target:

- `minipet.versecraft.cn`
- `api.minipet.versecraft.cn`

Enable HTTPS certificates in Coolify for both domains.

## 2. Create PostgreSQL In Coolify

1. In Coolify, create a new PostgreSQL database in the MiniPet project.
2. Keep the database private/internal.
3. Copy the internal PostgreSQL connection string into the application runtime variable `DATABASE_URL`.
4. Do not print or commit the database password.

If Coolify cannot create the database automatically, use this compose shape on a trusted host and keep the password in host environment or Coolify secrets:

```yaml
services:
  postgres:
    image: postgres:16
    restart: unless-stopped
    environment:
      POSTGRES_DB: minipet
      POSTGRES_USER: minipet
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - minipet-postgres:/var/lib/postgresql/data

  minipet:
    build:
      context: .
      dockerfile: Dockerfile
    restart: unless-stopped
    depends_on:
      - postgres
    ports:
      - "8080:8080"
    env_file:
      - .env.production

volumes:
  minipet-postgres:
```

## 3. Create The Coolify Application

1. Create a new application from GitHub repository `bei666qi-pan/minipet`.
2. Branch: `main`.
3. Build type: Dockerfile.
4. Dockerfile path: `Dockerfile`.
5. Build context: repository root.
6. Exposed port: `8080`.
7. Health check path: `/health`.
8. Add domains to the same application:
   - `https://minipet.versecraft.cn`
   - `https://api.minipet.versecraft.cn`
9. Enable HTTPS.

## 4. Runtime Environment Variables

Set these as runtime variables only. Do not set them as build variables.

Required:

```text
NODE_ENV=production
PORT=8080
MINIPET_WEB_ORIGIN=https://minipet.versecraft.cn
MINIPET_API_ORIGIN=https://api.minipet.versecraft.cn
MINIPET_DOWNLOAD_ORIGIN=https://download.minipet.versecraft.cn
DATABASE_URL=<internal postgres connection string>
JWT_SECRET=<long random secret>
ADMIN_EMAIL=<admin email>
ADMIN_PASSWORD_HASH=<scrypt hash preferred>
NEWAPI_BASE_URL=<server-side NewAPI base URL>
NEWAPI_API_KEY=<server-side NewAPI key>
NEWAPI_DEFAULT_MODEL=<model name>
```

Optional:

```text
MINIPET_RELEASE_VERSION=0.1.0
MINIPET_RELEASE_NOTES=MiniPet Windows installer
MINIPET_BLOCKED_WORDS=
MINIPET_HIGH_RISK_WORDS=delete,payment,transfer,submit form,send message,run command
MINIPET_IP_WINDOW_MS=60000
MINIPET_IP_MAX_REQUESTS=60
MINIPET_DEVICE_DAILY_REQUEST_LIMIT=500
```

Do not put these into build variables:

- `NEWAPI_API_KEY`
- `DATABASE_URL`
- `JWT_SECRET`
- `ADMIN_PASSWORD`
- `ADMIN_PASSWORD_HASH`
- Volcengine AK/SK
- Coolify token

## 5. Admin Password

Prefer `ADMIN_PASSWORD_HASH` in production. If you temporarily use `ADMIN_PASSWORD`, remove it after the first successful deployment and replace it with a hash.

The backend creates or updates the admin user on startup when `ADMIN_EMAIL` plus `ADMIN_PASSWORD_HASH` or `ADMIN_PASSWORD` exists.

## 6. Release Download Setup

The website download button reads release data in this order:

1. `https://minipet.versecraft.cn/v1/releases/latest`
2. `https://download.minipet.versecraft.cn/latest/latest.json`
3. `https://api.minipet.versecraft.cn/v1/releases/latest`

Upload the Windows installer to TOS before public launch:

```powershell
pnpm run dist:win
pnpm run release:upload
```

`pnpm run release:upload` requires these local or CI secrets:

```text
VOLCENGINE_ACCESS_KEY_ID
VOLCENGINE_SECRET_ACCESS_KEY
VOLCENGINE_TOS_BUCKET
VOLCENGINE_TOS_REGION
VOLCENGINE_TOS_ENDPOINT
VOLCENGINE_CDN_DOMAIN=download.minipet.versecraft.cn
```

It uploads:

- `releases/v${version}/MiniPetSetup-${version}-x64.exe`
- `latest/MiniPetSetup.exe`
- `latest/latest.json`

## 7. Deploy

1. Save runtime environment variables.
2. Trigger a redeploy in Coolify.
3. Confirm the build uses `Dockerfile`.
4. Confirm logs do not print any API key, token, database password, or AK/SK.
5. Confirm the app is healthy in Coolify.

## 8. Verification

Run these checks after DNS and HTTPS are active:

```powershell
curl.exe -fsS https://api.minipet.versecraft.cn/health
curl.exe -I https://minipet.versecraft.cn
curl.exe -I https://download.minipet.versecraft.cn/latest/MiniPetSetup.exe
curl.exe -fsS https://download.minipet.versecraft.cn/latest/latest.json
```

Expected:

- `/health` returns JSON with `"ok":true`.
- `https://minipet.versecraft.cn` returns HTTP 200 and displays the MiniPet landing page.
- Download installer response has `Content-Length > 0`.
- `latest.json` has `version`, `channel`, `installer_url`, `sha256`, `size`, `release_notes`, and `published_at`.
- The website download button points to `https://download.minipet.versecraft.cn/latest/MiniPetSetup.exe`.
- `https://minipet.versecraft.cn/admin` shows the login page.
- Admin login succeeds with `ADMIN_EMAIL` and the configured password/hash.

## 9. Operational Notes

- Usage, quota, release manifests, and audit logs are stored in PostgreSQL.
- Application stdout/stderr logs remain in Coolify logs.
- SQLite fallback exists only for local smoke tests; production should use PostgreSQL.
- If admin login fails, check only variable presence and user rows. Do not print passwords or hashes in logs.
