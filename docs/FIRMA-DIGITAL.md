# Firma digital del instalador

## Para usuarios: qué es y cómo verificar
El instalador de Windows puede llevar una **firma digital**: un sello criptográfico que dice *quién publicó* el archivo
y que *nadie lo alteró*. Sin firma, Windows SmartScreen muestra "Windows protegió su PC"; con firma verás un editor
conocido.

CapiChad solicita la firma gratuita de [SignPath Foundation](https://signpath.org) para proyectos de código abierto
(ver [CODE_SIGNING_POLICY.md](../CODE_SIGNING_POLICY.md)). Cuando está firmado, el editor que muestra Windows es
**SignPath Foundation**.

Verifica siempre lo que descargas:
```powershell
Get-FileHash .\CapiChad-Setup-<versión>.exe -Algorithm SHA256          # compara con las notas de la versión
Get-AuthenticodeSignature .\CapiChad-Setup-<versión>.exe | Format-List  # Status: Valid, si está firmado
```

## Para el mantenedor: cómo se activa la firma
El flujo [`release.yml`](../.github/workflows/release.yml) ya incluye el paso de firma; solo se activa cuando existen las
variables del repositorio. Pasos (una sola vez):

1. **Solicitar** el programa en <https://signpath.org/apply> con este repositorio. Condiciones verificadas en
   <https://signpath.org/terms>: licencia aprobada por la OSI sin doble licencia comercial, sin componentes propietarios,
   proyecto mantenido, verificación en dos pasos, política de firma publicada y privacidad documentada.
2. **En SignPath** (tras la aprobación): crear el *proyecto* y estas piezas:
   - *Trusted build system* **GitHub.com** y enlazarlo al proyecto.
   - *Artifact configuration* con el contenido de [`signpath/artifact-configuration.xml`](signpath/artifact-configuration.xml).
   - *Signing policy* con aprobación manual (rol *Approver*) y, opcionalmente, las restricciones de rama
     (`non_fast_forward` y `deletion`, que este repo ya cumple con sus *rulesets*).
3. **En GitHub** (*Settings → Secrets and variables → Actions*):
   - Secreto `SIGNPATH_API_TOKEN` (token de un usuario con permiso de *submitter*).
   - Variables `SIGNPATH_ORGANIZATION_ID`, `SIGNPATH_PROJECT_SLUG`, `SIGNPATH_POLICY_SLUG`.
4. **Publicar** una versión: `git tag v1.7.1 && git push origin v1.7.1`. El flujo compila, SignPath verifica el origen,
   tú apruebas la petición en su panel y la Release sale firmada.
5. **Atribución**: tras la aprobación, mostrar en el README y en las notas de la versión:
   *"Free code signing provided by SignPath.io, certificate by SignPath Foundation"* y actualizar el estado de
   [CODE_SIGNING_POLICY.md](../CODE_SIGNING_POLICY.md).

Nota: se firma el **instalador**. Los ejecutables internos (`CapiChad.exe` dentro del instalador) quedan sin firma
propia; para firmarlos también habría que empaquetar en dos fases.
