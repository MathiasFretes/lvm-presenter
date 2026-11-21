# Importación directa desde LVM Service

El importador de proyectos acepta el JSON Service 0.1 que descarga Service desde «Presentación → Descargar para Presenter». Se abre desde el control habitual de importar un proyecto; no requiere ejecutar el conversor por consola ni cambiar la extensión. Los proyectos `.project` existentes siguen usando su ruta anterior.

`src/lvm/projectImport.mjs` distingue ambos formatos y reutiliza `serviceToProject`. Un lote se analiza antes de modificar los stores: un JSON corrupto o una versión de Service no admitida muestra el aviso traducido de importación fallida. No se añade otro parser musical, identidad ni sincronización en la nube.

## Evidencia del 21 de noviembre de 2026

- Ocho pruebas Node de contratos/importación y 188 pruebas unitarias aprobadas (9 omitidas por la configuración existente).
- Compilaciones productiva de frontend y Electron aprobadas.
- La prueba Electron `config/testing/lvmService.test.ts` puede leer `LVM_SERVICE_JSON`, una ruta al archivo generado por `LVM Service/scripts/verify-worship-connected.mjs`. Ese verificador descarga el JSON mediante el botón real del HTTPS publicado y lo compara con el plan incorporado en PostgreSQL.
- Con ese archivo se comprobó la importación directa, guardado local, reinicio sin Internet y letra visible en `.previewOutput`. Los perfiles, APPDATA y LOCALAPPDATA de QA son temporales y separados del perfil del usuario; el cierre usa la salida de la aplicación y elimina solo su proceso de prueba si fuera necesario.
- El lint del archivo de conversión tiene seis incidencias previas, frente a siete en HEAD; la integración no introduce una categoría nueva de error. El formato de los archivos modificados se comprobó por separado.

Para repetir la prueba conectada en PowerShell después de preparar una compilación productiva de Presenter:

```powershell
$env:LVM_SERVICE_JSON = 'C:/la-voz-misionera/LVM Service/test-results/worship-exchange/connected-service.json'
npx playwright test --config config/testing/playwright.config.ts config/testing/lvmService.test.ts --grep 'imports Service JSON directly'
Remove-Item Env:LVM_SERVICE_JSON
```

La compilación Vite sola no prepara `public/index.html` para Electron productivo; el flujo completo de build/postbuild debe seleccionar el bundle generado. Las pruebas deben ejecutarse con esa entrada productiva y devolver luego la entrada fuente al repositorio si la preparación la modificó.

La vista previa de la aplicación no demuestra una salida física, un instalador firmado ni la sincronización automática del escritorio con PostgreSQL. Esos gates permanecen separados.
