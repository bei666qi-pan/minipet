# MiniPet Delivery Flow

## Product Flow

1. User opens `https://minipet.versecraft.cn`.
2. The landing page links to `https://download.minipet.versecraft.cn/MiniPetSetup.exe`.
3. The Windows installer installs MiniPet and runs it after finish.
4. MiniPet appears on the desktop and introduces itself.
5. Basic AI chat uses the MiniPet cloud API, with no local URL/API Key/NewAPI/OpenClaw setup.
6. Each device receives a default 2,000,000 token quota.
7. Admins can sign in at `/admin`, view usage, change quota, and disable devices.
8. Advanced users can switch the desktop app to self-provided model/API Key mode in settings.

## Coolify

Deploy this repository with the included `Dockerfile`.

- Expose container port `8080`.
- Set the production variables from `docs/ENV_REQUIRED.md`.
- Point `minipet.versecraft.cn` and `api.minipet.versecraft.cn` at this service, or deploy two Coolify apps with the same image if you prefer separate hostnames.
- Use a persistent PostgreSQL database via `DATABASE_URL`.

## Windows Installer

The GitHub workflow `.github/workflows/build-windows.yml` builds `release/MiniPetSetup.exe` on `main`.

If Volcengine TOS secrets are configured in GitHub Secrets, the workflow uploads the installer to `MiniPetSetup.exe` in the configured bucket. Otherwise, the artifact is still available as a GitHub Actions artifact and the upload step safely skips itself.

## Security

- Do not put API keys, NewAPI tokens, database passwords, Coolify tokens, or Volcengine AK/SK in the repository or frontend code.
- The desktop app stores only its cloud device token locally via Electron safe storage.
- NewAPI credentials are read only by the server process.
