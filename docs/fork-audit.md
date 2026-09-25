# Auditoría inicial de LVM Presenter

Base: FreeShow `13879edffb94600d563479a212fb16ebc7ce4040` (`1.6.6-beta.3`), preservada en el tag `baseline/freeshow`. Esta es una clasificación preliminar, no una lista de archivos para borrar.

| Decisión | Área | Evidencia y razón |
| --- | --- | --- |
| Conservar | Presentación y salidas | `src/frontend/show/`, `src/frontend/MainOutput.svelte`, `src/electron/output/` y `src/electron/ndi/` aportan el motor de proyección. |
| Conservar | Biblia | `src/frontend/components/drawer/bible/` contiene la experiencia bíblica que probaremos con referencias y traducciones locales autorizadas. |
| Conservar | Shows y proyectos | `src/frontend/classes/Show.ts` y `src/frontend/components/export/project.ts` proporcionan objetos de presentación y listas de contenido. |
| Conservar | Operación local | FreeShow es una aplicación Electron; la prueba de culto debe ejecutarse sin conexión después de importar sus datos y medios. |
| Adaptar | Servicios | Mapear el contrato `Service` de La Voz Misionera a proyectos o listas de FreeShow; medir qué estructura admite sin modificar el renderer. |
| Adaptar | Canciones | Importar letras y secciones desde Worship sin duplicar la edición maestra de canciones. |
| Adaptar | Búsqueda bíblica | Probar referencia, texto, comparación y salida en vivo con traducciones locales antes de rediseñar UX. |
| Adaptar | Identidad | El repositorio se llama `lvm-presenter`, pero la UI y el paquete siguen llamándose FreeShow durante el baseline. |
| Posponer | Cloud y cuentas externas | `src/electron/cloud/` y proveedores externos se investigarán después de que funcione un servicio local sin Internet. |
| Investigar | Remote y streaming | Verificar capacidades y permisos reales con una instalación de escritorio antes de prometerlas como parte de LVM. |

## Baseline

- `npm ci`: completado en Windows con Node `22.13.0`; reconstruyó dependencias nativas. Algunas dependencias declaran un mínimo de Node `22.22.2`, por lo que la versión local no cumple todos los rangos aunque la instalación termine.
- `npm run test:unit`: 160 tests pasan, 9 omitidos.
- `npm run test:svelte`: falla en el commit original con 186 errores, 61 advertencias y 242 sugerencias. Es deuda de upstream, no introducida por LVM.
- `npm run build`: completado, incluida la compilación de Electron y los servidores auxiliares.
- `npm start`: abrió la ventana `FreeShow` en Windows. Si se ejecuta después de `npm run build`, primero hay que restaurar `public/index.html`, que el postbuild cambia a la entrada de producción mientras elimina `public/build/`.
- `npm run test:format`: falla en 1036 archivos del commit original.
- `npm run lint:styles`: falla con 212 errores del commit original; el lint de Svelte sin `--fix` reporta 159 errores y 39 advertencias.
- `npm run test:playwright`: 1 prueba de Electron pasa después de instalar Chromium y ejecutar `npm run build`. Verifica arranque, creación de proyecto y show, y guardado.

## Restricciones de integración

FreeShow conserva su licencia GPL-3.0. Worship proviene de GraceChords (Apache-2.0) y permanece en otro repositorio. El primer contrato compartido será datos JSON; no se copiará código entre proyectos sin revisar obligaciones de licencia. Las traducciones bíblicas solo se empaquetarán offline con derechos verificados.
