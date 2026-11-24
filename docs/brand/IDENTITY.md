# Identidad LVM: símbolo blanco y círculo dorado

Identidad elegida por el usuario el 24 de noviembre de 2026. Libro y llama en blanco puro #FFFFFF; paloma como recorte transparente. Se conservan las curvas del PDF/AI original.

## Fondo aprobado

Degradado vertical, oscuro arriba y claro abajo: #B28A3D (0%), #D5B36A (50%), #EFDEB3 (100%). No invertirlo ni colorear partes del símbolo. El azul de las interfaces sigue siendo #1C2A39.

## Aplicación

Sello circular en cabeceras, pantallas de inicio y launcher. En web, acompañarlo por el nombre legible del producto y conservar nombres accesibles. El símbolo no sustituye controles, indicadores ni texto funcional.

El degradado aprobado tiene menor contraste con blanco en la zona inferior. Es una elección de identidad, no una combinación para texto ni controles. No se declara cumplimiento de contraste funcional para el emblema. No se oscurece ni se añade contorno al símbolo sin una nueva decisión visual.

`lvm-circle.svg`: círculo con exterior transparente. `lvm-square.svg`: el mismo círculo dentro de un contenedor azul opaco para iOS. `lvm-foreground.svg`: el círculo completo con margen para iconos adaptativos. `lvm-transparent.svg`: símbolo blanco sin fondo para usos especiales, no el launcher.

Android, iOS y las PWA pueden aplicar su propia máscara exterior. Se conserva el sello circular dentro de las variantes que exige cada plataforma; no se promete forzar una forma exterior en todos los launchers. Los iconos monocromáticos de Android son una variante del sistema, no una versión a color alternativa.

## Interfaces 60–30–10

60% superficies neutras de lectura, 30% azul estructural #1C2A39 y 10% acentos dorados #C6A15B. El dorado de texto sobre blanco usa #825C18. No cambiar colores de estados, letras/acordes ni salida proyectada por esta actualización del logo.

## Componente compacto compartido

Emblema de 40 px, separación símbolo/texto de 12 px, nombre de 15 px y producto de 12 px. Navegación separada de la marca por 24 px. Estos valores son la escala inicial; el texto respeta el escalado accesible de cada plataforma. Poppins en web/Flutter; tipografía del sistema en Expo/SwiftUI según las guías nativas existentes. Las cabeceras públicas, paneles de trabajo y pantallas nativas conservan su distribución funcional.

`identity.tokens.json` registra las mismas decisiones en todos los repositorios; `identity.css` las expone a web. El nombre de producto es texto independiente del archivo del emblema. No reducir el emblema de cabecera a 24 px para acomodar enlaces: usar la navegación móvil existente.

## Microicono 16–32 px

`lvm-micro.svg` amplía uniformemente el símbolo dentro del mismo círculo (escala 0,94 frente a 0,82). Conserva trazados, paloma en negativo, blanco y fondo aprobados. Se limita a favicons e iconos de 16–32 px; el logo oficial y los launchers mayores no cambian. No garantiza que todos los detalles se distingan a 16 px.
