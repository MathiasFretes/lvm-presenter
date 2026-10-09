# M7.8C — Video E2E

## Alcance

Prueba del sender propio `@lavozmisionera/ndi` en Windows x64, aislado de Presenter Output Manager. El script `scripts/e2e-sender.mjs` usa únicamente la API pública `NdiSender`, reutiliza un buffer BGRA de 1920×1080 y produce barras de color, contador de frames y un bloque en movimiento. El addon conserva un buffer nativo reutilizable y llama al envío síncrono del SDK oficial NDI 6.3.2. El SDK, el runtime, Studio Monitor, las capturas y los reportes JSON permanecen en `.ndi-cache/`, fuera de Git.

## Receptor y comprobación visual

- Receptor: Studio Monitor de NDI 6 Tools 6.3.2, en la misma computadora Windows.
- Fuente detectada: `LAPTOP-62TAOCAS (LVM Presenter Test)`.
- El receptor mostró la imagen a 1080/30p. Dos capturas separadas mostraron el contador avanzar de `00002228` a `00002329`; se observaron barras de color y movimiento del bloque, con orientación correcta y sin corrupción visible en esas capturas.
- El receptor también detectó y mostró la fuente a 1080/60p. Una captura durante la prueba mostró el contador `00002602` y otra, cerca de los ocho minutos, `00029487`, con colores y orientación correctos y sin corrupción visible en esas capturas. Esta comprobación es visual/manual; el resultado de `send()` y las métricas del proceso no prueban por sí solos que un receptor muestra video.

## Comandos

Desde `packages/lvm-ndi`:

```powershell
npm run ndi:setup
npm run ndi:build
npm test
npm run ndi:verify
node scripts/e2e-sender.mjs --fps 30 --seconds 600
node scripts/e2e-sender.mjs --fps 60 --seconds 600
```

El receptor se inició aparte y se seleccionó la fuente `LVM Presenter Test`. Los archivos JSON de cada ejecución se escriben en `.ndi-cache/reports/` y contienen muestras de memoria cada 10 segundos. En este entorno se usó `node` directamente porque `npm run ndi:e2e -- --fps ...` no transmitió los argumentos de forma fiable en PowerShell.

## Resultados

| Prueba | Duración | Frames | FPS efectivo | Errores | Intervalos omitidos | `send` medio / máximo | CPU del proceso, equivalente a un núcleo | RSS observado |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 1080p30 | 600,01 s | 17.992 | 29,986 | 0 | 8 | 5,93 / 73,73 ms | 24,46 % | 75,81 MiB pico; ~75,7 MiB en el tramo final |
| 1080p60 | 600,01 s | 35.968 | 59,946 | 0 | 32 | 5,44 / 90,54 ms | 45,34 % | 76,67 MiB pico; ~76,0 MiB en el tramo final |

En 1080p30 hubo 19 frames marcados como tardíos por el planificador. Ocho intervalos se omitieron para mantener la cadencia, equivalentes a aproximadamente 0,04 % de los 18.000 intervalos previstos. La memoria subió durante el calentamiento y luego se mantuvo entre ~75,3 y 75,8 MiB durante los últimos siete minutos. El RSS medido después de destruir el sender no es comparable con el pico durante el envío.

En 1080p60 hubo 44 frames marcados como tardíos y 32 intervalos omitidos, aproximadamente 0,09 % de los 36.000 previstos. Tras el calentamiento, el RSS se mantuvo aproximadamente entre 75,5 y 76,2 MiB, salvo un pico aislado de 76,67 MiB. Ambas pruebas mantuvieron la imagen visible en el receptor y finalizaron sin crash ni error de envío. El CPU es tiempo de proceso dividido entre tiempo real y expresado como porcentaje de **un núcleo**, no porcentaje de toda la máquina. El envío síncrono cumplió este gate en esta computadora; no se justifica cambiarlo antes de medir el caso real de Presenter.

## Límites de la evidencia

Las métricas de `late` y `skipped` son del planificador del script; no miden pérdida de frames dentro de NDI ni en el receptor. Las capturas permiten comprobar colores, orientación y avance del contador en momentos concretos; no constituyen una inspección visual continua de todos los frames. Este milestone no incluye audio, receptor propio, tally, metadata, varios outputs ni integración con Presenter.
