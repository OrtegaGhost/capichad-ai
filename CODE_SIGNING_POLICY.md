# Code signing policy

> **Estado / Status:** solicitud a SignPath Foundation en trámite. Mientras no sea aprobada, los instaladores publicados
> **no están firmados** (Windows SmartScreen mostrará una advertencia). / Application to SignPath Foundation pending;
> until approved, published installers are **unsigned**.

## English

CapiChad is open-source software ([AGPL-3.0-or-later](LICENSE)). When signing is active, the Windows installer is signed
through [SignPath.io](https://signpath.io) with a certificate issued to the [SignPath Foundation](https://signpath.org).

*Free code signing provided by SignPath.io, certificate by SignPath Foundation.* (applies only to releases that are
marked as signed in their release notes)

### What is signed
- **Only** the official Windows installer `CapiChad-Setup-<version>.exe`.
- Built **only** by the GitHub Actions workflow [`release.yml`](.github/workflows/release.yml) on GitHub-hosted runners,
  from a version tag (`v*`) of this repository, using the pinned recipe in
  [`tools/preparar_dependencias.ps1`](tools/preparar_dependencias.ps1) (hashes verified).
- Nothing built on a personal computer is ever submitted for signing.

### Team roles
| Role | Member |
|---|---|
| Committers and reviewers | [OrtegaGhost](https://github.com/OrtegaGhost) (Capibara Software) |
| Approvers (approve each signing request) | [OrtegaGhost](https://github.com/OrtegaGhost) |

This is currently a single-maintainer project. Pull requests are disabled; every change goes through the maintainer.
The branch `main` and the release tags are protected against deletion and force-push.
All team members use multi-factor authentication on GitHub and SignPath.

### Privacy
See the [privacy policy](docs/PRIVACIDAD.md). CapiChad has no telemetry, accounts or analytics; it only contacts
third-party services (search, downloads) when the user asks for it or enables the optional internet mode, which can be
disabled at installation and at any time.

### Verifying a download
Compare the SHA-256 shown in the release notes with `Get-FileHash .\CapiChad-Setup-<version>.exe`, and (when signed) check
the signature with `Get-AuthenticodeSignature .\CapiChad-Setup-<version>.exe`.

## Español

CapiChad es software de código abierto. Cuando la firma esté activa, el instalador de Windows se firma mediante
[SignPath.io](https://signpath.io) con un certificado emitido a la [SignPath Foundation](https://signpath.org); en ese
caso el editor que verá Windows es *SignPath Foundation*, no una persona.

- **Qué se firma:** solo el instalador oficial, compilado por el flujo automático de GitHub Actions desde una etiqueta
  `v*` de este repositorio. Nunca se firma nada compilado en un equipo personal.
- **Roles:** un único mantenedor ([OrtegaGhost](https://github.com/OrtegaGhost)) es *committer*, revisor y aprobador.
  Los pull requests están desactivados; `main` y las etiquetas están protegidas.
- **Privacidad:** [docs/PRIVACIDAD.md](docs/PRIVACIDAD.md). Sin telemetría; el modo internet es opcional y se puede
  desactivar al instalar y en cualquier momento.
- **Verificación:** compara el SHA-256 de las notas de la versión con `Get-FileHash`; si está firmado, comprueba con
  `Get-AuthenticodeSignature`.
