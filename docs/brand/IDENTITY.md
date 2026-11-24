# Identidad LVM: azul degradado y silueta perlada

Dirección solicitada el 24 de noviembre de 2026. El libro, la llama y la paloma proceden del logo PDF/AI entregado por el usuario; no se sustituyen por iconografía genérica. La paloma es un recorte transparente dentro de la llama.

## Color y proporción 60–30–10

- 60%: superficies de lectura neutras (blanco #FFFFFF y #F6F7F9 en claro; azul profundo #0D1624 en oscuro).
- 30%: azul LVM #1C2A39 en navegación, estructura y texto principal. Degradado reservado a identidad y encabezados: #304965 → #1C2A39 (48%) → #0D1624.
- 10%: dorado LVM #C6A15B para CTA, selección y foco, conservando #825C18 para texto dorado sobre blanco. Estados de error/éxito conservan su significado.

Los porcentajes son jerarquía de uso del color, no alturas rígidas ni una cuota de píxeles que reduzca la legibilidad. En oscuro se mantienen los roles con superficies profundas y contenido claro. No se aplican degradados a formularios, letras/acordes o salida proyectada.

## Emblema y launcher

El sello de marca es un círculo azul con degradado y silueta #FFFFFF → #EDEBF4. Los PNG transparentes circulares se usan en encabezados y launcher donde se admite transparencia. El vector cuadrado opaco es una variante de plataforma, no una nueva marca: iOS exige un contenedor opaco y aplica su propia máscara; Android y las PWA también pueden imponer la máscara del launcher. No se promete que una app pueda forzar la forma exterior en todos los sistemas. En esas superficies el sello circular permanece visible dentro del contenedor requerido.

`lvm-circle.svg` es el emblema; `lvm-square.svg` la variante opaca; `lvm-foreground.svg` conserva margen para el icono adaptativo. Los PNG se derivan de esos vectores. Mantener el recorte de la paloma y las curvas originales. Archivos PDF/AI originales intactos en D:/IPLVM.
