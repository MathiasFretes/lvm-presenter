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
- **Gate pendiente:** el instalador QA no completó la instalación en esta máquina. Las invocaciones silenciosas terminaron con código 2; una invocación directa creó únicamente el directorio de destino vacío. La integridad del archivo comprimido pasó con 7-Zip, pero eso no demuestra instalación. No hay resultado válido de instalación, desinstalación ni prueba en una PC/VM limpia.
- Firma: no se configuró certificado de firma en este entorno. Una build pública debe firmarse y verificarse antes de publicarse.

M7.8F permanece abierto hasta resolver el instalador, repetir los casos en una instalación limpia y completar la verificación de firma. `main` y los releases publicados no se modifican desde esta rama.
