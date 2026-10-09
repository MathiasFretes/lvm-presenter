# M7.8F — LVM NDI release y distribución (Windows x64)

## Estrategia del runtime

El instalador Windows x64 de LVM Presenter contiene la aplicación Electron y `lvm_ndi.node` como recursos separados. No incluye el SDK, DLLs NDI ni NDI Tools. Para usar la salida NDI, el usuario instala el [runtime oficial NDI 6](https://ndi.link/NDIRedistV6) por separado y reinicia Presenter. La UI enlaza el runtime y la [información oficial de NDI](https://ndi.video/) junto a la salida; Acerca de muestra la atribución de marca.

La [documentación oficial de carga dinámica](https://docs.ndi.video/all/developing-with-ndi/sdk/dynamic-loading-of-ndi-libraries) contempla localizar un runtime instalado mediante una variable de entorno y guiar al usuario a su descarga si falta. La [documentación de distribución](https://docs.ndi.video/all/developing-with-ndi/sdk/software-distribution) permite incluir el redistributable bajo condiciones, pero esta primera distribución evita incorporarlo al instalador. La [licencia del SDK](https://docs.ndi.video/all/developing-with-ndi/sdk/licensing) exige enlace a NDI cerca de su selección, atribución de marca y revisión de los términos vigentes antes de publicar. La web pública también debe enlazar NDI antes de anunciar esta función.

El addon busca `Processing.NDI.Lib.x64.dll` en `LVM_NDI_RUNTIME_DIR`, `NDI_RUNTIME_DIR_V6` y `NDI_RUNTIME_DIR_V5`, en ese orden. Si no está disponible, Presenter debe abrir normalmente y la salida NDI debe mostrar un error; ninguna DLL se copia al sistema ni al repositorio.

## Preparar el paquete

Desde la raíz de Presenter:

```powershell
npm ci
```

En `packages/lvm-ndi`, instalar sus herramientas sin ejecutar el `install` automático, que intenta compilar antes de conocer el SDK. Luego detectar el SDK y compilar explícitamente:

```powershell
npm ci --ignore-scripts
npm run ndi:setup
npm run ndi:build
```

`ndi:setup` puede usar `NDI_SDK_DIR` y `LVM_NDI_RUNTIME_DIR` provisionados en CI. Ambos apuntan a ubicaciones locales ignoradas por Git. Volver a la raíz:

```powershell
npm run build
```

Crear el instalador Windows con `electron-builder` y la configuración de `config/building/electron-builder.yaml`. Una build pública requiere credenciales de firma válidas. Para QA local se puede usar una copia temporal de esa configuración sin `azureSignOptions`; el instalador resultante queda **sin firmar y no se publica**.

## Gate de release

1. Inspeccionar `app.asar` y `resources/lvm-ndi`: el ASAR no debe contener la carpeta de desarrollo NDI; `resources/lvm-ndi` debe contener solo `src/index.mjs` y `build/Release/lvm_ndi.node`. `.ndi-cache`, SDK, `Processing.NDI.Lib.x64.dll`, LIB y redistributables no deben estar incluidos.
2. Instalar en un perfil/equipo sin entorno de desarrollo. Sin runtime, Presenter abre y Outputs muestra error claro al activar NDI; las otras salidas siguen disponibles.
3. Instalar el runtime oficial. Abrir Presenter de nuevo; crear salida LVM NDI, comprobar estado activo, desactivar, volver a activar y cerrar sin procesos huérfanos.
4. Desinstalar Presenter y verificar que no deja su ejecutable ni procesos abiertos. La instalación del runtime oficial es independiente y no debe ser eliminada por el desinstalador de Presenter.
5. Validar firma del instalador publicado y los enlaces/atribuciones en la UI, documentación y web pública.

La prueba corta `node scripts/lvm/ndi-release-smoke.mjs <ruta-al-ejecutable> [directorio-runtime]` automatiza el arranque, el estado sin/con runtime y el cierre del proceso desde el paquete. No inicia Studio Monitor ni mide FPS. Una prueba en el equipo de desarrollo con perfil temporal **no sustituye** la instalación en una PC o VM limpia.

## Evidencia de esta rama

- `npm ci` en la raíz, `npm run ndi:setup`, `npm run ndi:build` y `npm run build`: correctos. La instalación inicial dentro de `packages/lvm-ndi` disparó `node-gyp` antes de configurar el SDK; para una instalación limpia se debe usar `npm ci --ignore-scripts` como indica esta guía. Ese flujo completo aún debe repetirse en CI.
- `npm run test:unit`: 165 tests aprobados, 9 omitidos.
- Instalador QA Windows x64 generado sin credenciales de firma, con identidad temporal `app.lvmpresenter.m78fqa`. No se publicó.
- `npm run ndi:package:verify`: correcto. El paquete contiene solo la entrada pública `index.mjs` y `lvm_ndi.node` para NDI; no contiene SDK, runtime ni `.ndi-cache`.
- Ejecutable empaquetado: el smoke con perfil temporal pasó con runtime ausente (error NDI claro y Presenter operativo) y con runtime presente (estado activo, envío de frames, desactivación y cierre). No se ejecutaron benchmarks ni Studio Monitor.
- **QA interactivo (6 de octubre de 2026):** dos invocaciones silenciosas terminaron con código 2. La instalación interactiva del mismo ejecutable sí completó la extracción de 381 archivos, creó el desinstalador y registró la entrada de usuario. El ejecutable instalado abrió; el smoke con perfil temporal verificó error controlado sin runtime y estado `active` con runtime. `ndi:package:verify` pasó y el directorio instalado no contiene SDK, DLL ni LIB de NDI.
- **Desinstalación interactiva:** el usuario abrió el desinstalador del paquete QA y confirmó la eliminación. La carpeta instalada y el acceso directo desaparecieron, y no quedó ningún proceso ejecutado desde esa instalación. Sin embargo, permanecieron dos claves de usuario exclusivas de QA (`HKCU\\Software\\127a1745-dba5-52aa-bd26-d616509ff4d9` y `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\127a1745-dba5-52aa-bd26-d616509ff4d9`), que aún apuntan a la carpeta eliminada. Dos procesos antiguos de `dist/win-unpacked`, ajenos a la instalación, se terminaron mediante `Win32_Process.Terminate`.
- **Gate pendiente:** corregir y volver a verificar la limpieza del registro en el desinstalador interactivo. La desinstalación silenciosa había devuelto código 0 sin retirar archivos ni registro cuando existían procesos QA sin ventana; la instalación silenciosa devuelve código 2. El intento de limpiar las dos claves residuales mediante automatización fue rechazado por la revisión automática; no se volvió a intentar. Probar además el ciclo en una PC/VM limpia y firmar antes de publicar.
- Firma: no se configuró certificado de firma en este entorno. Una build pública debe firmarse y verificarse antes de publicarse.

M7.8F permanece abierto hasta resolver el instalador, repetir los casos en una instalación limpia y completar la verificación de firma. `main` y los releases publicados no se modifican desde esta rama.

## Auditoría de la identidad QA y del uninstall (6 de octubre de 2026)

El paquete QA se construyó con `appId: app.lvmpresenter.m78fqa`, `productName: LVM Presenter M78F QA` y artefacto `LVM-Presenter-M78F-QA-1.6.6-beta.3-x64.exe`. `electron-builder` 26.16.1 usa NSIS `oneClick=true` y `perMachine=false` por defecto. Deriva el GUID `127a1745-dba5-52aa-bd26-d616509ff4d9` con UUID v5 a partir del `appId`. Las dos claves residuales usan exactamente ese GUID; no hay evidencia de un desajuste de identidad.

| Momento | `HKCU\Software\127a1745-dba5-52aa-bd26-d616509ff4d9` | `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\127a1745-dba5-52aa-bd26-d616509ff4d9` | Carpeta instalada |
| --- | --- | --- | --- |
| Antes de la instalación interactiva | No se capturó una línea base limpia; había intentos QA anteriores | No se capturó una línea base limpia | No confirmada |
| Después de instalar | `InstallLocation=C:\Users\mathi\AppData\Local\Programs\@lavozmisionerapresenter`; `ShortcutName=LVM Presenter M78F QA` | `DisplayName=LVM Presenter M78F QA 1.6.6-beta.3`; `DisplayVersion=1.6.6-beta.3`; `Publisher=LVM Service`; `UninstallString` apunta al desinstalador QA con `/currentuser`; `QuietUninstallString` agrega `/S` | Presente |
| Después de desinstalar interactivamente | Permanece con los mismos valores | Permanece con los mismos valores | Ausente |

La plantilla NSIS instalada en `app-builder-lib` escribe ambas claves con `SHELL_CONTEXT` y contiene `DeleteRegKey SHELL_CONTEXT` para las dos rutas al final de `uninstaller.nsh`. La cuenta actual es propietaria de ambas y tiene `FullControl`. El usuario indicó que, tras aceptar la desinstalación, la ventana se cerró sin mensaje. La carpeta y el shortcut se eliminaron, pero las claves no. No se puede afirmar aún si la ejecución no llegó a `DeleteRegKey` o si la operación falló; se necesita una traza del desinstalador. No se deben borrar manualmente las claves para hacer pasar el gate.

Tras liberar espacio en C:, se completaron dos instalaciones diagnósticas adicionales en identidades y carpetas independientes. Ninguna modificó la instalación normal ni el código productivo:

| Variante | NSIS | Línea base antes de instalar | Resultado al desinstalar |
| --- | --- | --- | --- |
| QA2, `app.lvmpresenter.m78fqa2` | `oneClick=true`, `perMachine=false` | GUID `889e3bf8-ce9f-5a35-a1ca-d2ce0901963e` ausente en las dos rutas; carpeta ausente | Carpeta eliminada; ambas claves HKCU permanecen |
| QA3, `app.lvmpresenter.m78fqa3` | `oneClick=false`, `perMachine=false` | GUID `2c4eee6a-89f7-53e5-88e7-312d7eee9f8f` ausente en las dos rutas; carpeta ausente | Carpeta eliminada; ambas claves HKCU permanecen |

QA2 y QA3 se instalaron y desinstalaron interactivamente. Las claves residuales tienen propietario `LAPTOP-62TAOCAS\mathi` y `FullControl` para esa cuenta; existen tanto al consultarlas con `/reg:32` como con `/reg:64`. La traza NSIS en ambas variantes confirma `SECTION_BEGIN mode=CurrentUser` y la ruta de instalación correcta, pero una lectura de `InstallLocation` mediante `ReadRegStr HKCU "${INSTALL_REGISTRY_KEY}"` dentro de `customUnInstall` devolvió vacío. Esto requiere investigar la expansión/contexto de esa macro: la traza no prueba por sí sola que la instrucción final `DeleteRegKey` se haya ejecutado o que haya fallado. Las marcas de última escritura de las claves corresponden a las instalaciones, no a una recreación posterior. Minutos después de las desinstalaciones, las claves seguían presentes y no había procesos QA ni NSIS activos.

La primera compilación de QA2 falló por falta de espacio y dejó una salida temporal ignorada en `node_modules/.cache/m78f-qa2-dist`. La revisión automática rechazó borrarla; no se eludió el bloqueo. Después de liberar espacio, las compilaciones de QA2 y QA3 terminaron correctamente. Los instaladores y sus salidas diagnósticas permanecen fuera de Git. **M7.8F sigue bloqueado por el registro**; cambiar `oneClick` no lo resuelve. No se agregará una eliminación de claves especulativa al instalador productivo.

## Traza precisa del bloque `DeleteRegKey` (QA4)

Se compiló **una sola** instalación adicional, `app.lvmpresenter.m78fqa4`, con una copia temporal instrumentada de la plantilla `uninstaller.nsh` de `app-builder-lib` 26.16.1. La plantilla original se restauró después de compilar (hash SHA-256 idéntico); la instrumentación y el paquete QA4 quedaron en `node_modules/.cache`, fuera de Git. Antes de instalar, no existían las claves del GUID `392eb5ab-95fc-5cb1-9203-c8608d0704fd` ni la carpeta QA4. El usuario completó la desinstalación interactiva. El log temporal `lvm-m78f-qa4-uninstall.log` mostró:

```text
UNINSTALL_START
USER=mathi; MODE=CurrentUser; GUID=392eb5ab-95fc-5cb1-9203-c8608d0704fd
APP_KEY=Software\392eb5ab-95fc-5cb1-9203-c8608d0704fd
UNINSTALL_KEY=Software\Microsoft\Windows\CurrentVersion\Uninstall\392eb5ab-95fc-5cb1-9203-c8608d0704fd
SHCTX_READ_APP error=1
HKCU_32_READ_APP error=1
HKCU_64_READ_APP error=1
BEFORE_DELETE_UNINSTALL read_error=1
AFTER_DELETE_UNINSTALL delete_error=1
CHECK_UNINSTALL read_error=1
BEFORE_DELETE_APP read_error=1
AFTER_DELETE_APP delete_error=1
CHECK_APP read_error=1
UNINSTALL_END
```

Cada lectura y eliminación tuvo `ClearErrors` inmediatamente antes y comprobación de `${Errors}` inmediatamente después. Se conservó el orden original de electron-builder: primero la clave `Uninstall`, después la clave de la app. **El flujo sí llega a ambos `DeleteRegKey`; ambos señalan error.** La carpeta y el shortcut QA4 se eliminaron, pero las dos claves permanecieron. No hubo procesos QA4 activos al terminar.

Una lectura posterior desde PowerShell confirmó que ambas claves están en `HKCU` y en `HKEY_USERS\<SID de mathi>`, visibles en las vistas `/reg:32` y `/reg:64`. El SID de la cuenta actual es propietario y tiene `FullControl` en ambas claves. Por tanto, el error está acotado a cómo el proceso NSIS accede a esas claves o a cómo interpreta su contexto, no a una salida prematura antes del bloque de limpieza. El log indica el nombre de usuario y el perfil, pero **no registra el SID del token del proceso NSIS**; no se debe afirmar todavía cuál es la causa final. No se implementó workaround, no se eliminaron claves manualmente y no se hicieron más instalaciones QA.

## Diagnóstico de contexto HKCU (QA5, 6 de octubre de 2026)

`config/building/diagnostics/m78f-uninstall-context.nsh` contiene una inclusión **solo para QA**. `config/building/diagnostics/m78f-uninstaller-context.patch` inserta su llamada antes de `initMultiUser` en la plantilla NSIS de `app-builder-lib` 26.16.1. El parche pasó `git apply --check`, se aplicó únicamente al compilar QA5 y la plantilla original se restauró al terminar (hash SHA-256 idéntico). La configuración productiva no referencia estos archivos. QA5 se compiló sin firma con una identidad y carpeta distintas de las instalaciones anteriores; el paquete y la configuración temporal quedaron fuera de Git.

Antes de instalar se verificó que no existían la identidad QA5, su carpeta ni el marcador. El usuario completó una instalación y una desinstalación interactivas. Antes de cualquier lectura de `InstallLocation` por `initMultiUser`, el desinstalador registró en `%TEMP%\lvm-m78f-qa5-context.log` el usuario, tipo de cuenta, elevación, perfil, TEMP, APPDATA, LOCALAPPDATA, GUID y ruta instalada. Escribió `marker=QA5` en `HKCU\Software\LVM-M78F-Diagnostic`; después de `initMultiUser`, leyó el marcador mediante `SHELL_CONTEXT`.

```text
env_username=mathi userinfo_name=mathi account_type=User elevated_admin=no
profile=C:\Users\mathi
temp=C:\Users\mathi\AppData\Local\Temp
appdata=C:\Users\mathi\AppData\Roaming
localappdata=C:\Users\mathi\AppData\Local
marker_write_error=0
AFTER_INIT_MULTI_USER install_mode=CurrentUser
shell_context_marker=QA5 shell_context_read_error=0
UNINSTALL_INIT_END
```

La enumeración general de `HKEY_USERS` fue denegada por Windows, pero la consulta directa de `HKEY_USERS\<SID de mathi>\Software\LVM-M78F-Diagnostic` encontró el mismo marcador `QA5` que `HKCU`. **El HKCU del desinstalador corresponde al SID del usuario que instaló Presenter.** Esto descarta la hipótesis principal de un perfil de usuario distinto. QA5 eliminó carpeta y accesos directos y no dejó procesos, pero sus dos claves de instalación siguen presentes. El marcador y todas las claves QA se conservaron como evidencia; no se borró ninguna.

QA4 ya había demostrado que las lecturas y los dos `DeleteRegKey` de esas rutas devuelven error desde NSIS, incluso probando las vistas 32 y 64. QA5 demuestra que el mismo proceso sí puede escribir y leer otra clave en HKCU. La causa específica del rechazo de las claves de instalación **sigue sin identificarse**. De acuerdo con el gate de esta investigación, **M7.8F queda abierto y en pausa**. No se harán más variantes QA ni workarounds de borrado hasta contar con evidencia nueva; el resto del roadmap puede avanzar sin fusionar esta rama a `main`.
