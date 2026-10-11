# LVM Presenter Remote Control 0.1

Estado: **contrato de implementación aprobado para el primer control remoto
propio de LVM**.

Este documento define la frontera entre LVM Presenter para Windows y LVM
Presenter Remote para Android. No reutiliza ni expone los servidores, puertos,
mensajes o clientes remotos heredados que todavía existen en el árbol histórico
de Presenter.

## Objetivo

Una persona que opera una presentación puede emparejar un único teléfono desde
la interfaz de Presenter y controlar la presentación abierta en la misma red
local.

La primera versión cubre solamente:

- conocer el nombre del culto y el estado de salida;
- ver el ítem y la diapositiva actual;
- ir a la siguiente o anterior diapositiva;
- ir a una diapositiva concreta;
- limpiar y restaurar la salida;
- desconectar el teléfono desde Presenter.

No cubre edición de contenido, importaciones, archivos, NDI, audio, Stage,
usuarios remotos múltiples, acceso por Internet ni sincronización con LVM
Service.

## Ownership

| Componente | Responsabilidad |
| --- | --- |
| LVM Presenter | genera pairing, acepta o rechaza dispositivos y aplica comandos al Presentation Engine |
| LVM Presenter Remote | muestra el estado recibido y solicita comandos permitidos |
| Presentation Engine | mantiene la diapositiva actual y produce la salida; no conoce Android ni WebSocket |
| M9 Auth | identidad central y políticas entre cuentas; queda fuera de 0.1 |

Presenter conserva la autoridad. El teléfono nunca infiere estado ni manipula
archivos de presentación directamente.

## Pairing local explícito

1. El operador abre **Outputs → Presenter Remote** en LVM Presenter.
2. Presenter genera un `pairingId` aleatorio, un secreto de un solo uso y un QR.
3. El QR incluye la dirección local, puerto, `pairingId` y secreto. No incluye
   Service, credenciales de API ni rutas de archivos.
4. La app Android muestra los datos leídos y solicita conexión.
5. Presenter muestra una aprobación local con el nombre del dispositivo.
6. Al aprobar, Presenter entrega un `sessionToken` aleatorio ligado a ese
   dispositivo y con vencimiento.
7. Presenter conserva el dispositivo autorizado de forma local hasta que el
   operador lo revoca; la app conserva solamente su token local.

No hay descubrimiento automático por escaneo de puertos ni conexión sin una
aprobación visible en Presenter.

## Transporte

La implementación inicial usa una sola conexión WebSocket dentro de la LAN,
creada únicamente después de escanear el QR. El endpoint y los mensajes viven
bajo el namespace `lvm.remote.0.1`; no se reutilizan rutas ni tipos heredados.

La primera versión requiere una red local confiable y la aprobación del
operador. El acceso remoto por Internet, TLS administrado y políticas por
cuenta pertenecen a M9 y no se simulan aquí.

## Mensajes

Todos los mensajes son objetos JSON con estos campos comunes:

```json
{
  "schemaVersion": "0.1",
  "type": "...",
  "requestId": "uuid"
}
```

`requestId` es obligatorio en mensajes iniciados por la app y se repite en la
respuesta. Campos desconocidos, versiones distintas de `0.1` y tokens ausentes
fallan de manera controlada.

### Pairing

```json
{
  "schemaVersion": "0.1",
  "type": "pair.request",
  "requestId": "uuid",
  "pairingId": "uuid",
  "pairingSecret": "base64url",
  "device": { "id": "uuid", "name": "Honor 200 Pro" }
}
```

Presenter responde `pair.pending`, `pair.approved` o `pair.rejected`.
`pair.approved` incluye solamente un `sessionToken` opaco y su vencimiento.

### Estado

Presenter envía un `state.snapshot` al conectar y un `state.changed` cuando
cambia el motor:

```json
{
  "schemaVersion": "0.1",
  "type": "state.snapshot",
  "show": { "id": "culto-domingo", "title": "Culto General" },
  "current": { "itemIndex": 2, "slideIndex": 4, "slideCount": 8 },
  "output": { "isLive": true, "isCleared": false }
}
```

Si no hay presentación abierta, `show` y `current` son `null`; el control de
navegación queda deshabilitado.

### Comandos permitidos

```json
{ "schemaVersion": "0.1", "type": "command.next", "requestId": "uuid" }
{ "schemaVersion": "0.1", "type": "command.previous", "requestId": "uuid" }
{ "schemaVersion": "0.1", "type": "command.goTo", "requestId": "uuid", "slideIndex": 4 }
{ "schemaVersion": "0.1", "type": "command.clear", "requestId": "uuid" }
{ "schemaVersion": "0.1", "type": "command.restore", "requestId": "uuid" }
```

Presenter responde `command.applied` con el snapshot resultante o
`command.rejected` con uno de estos códigos:

- `unauthorized`
- `expired_session`
- `no_presentation`
- `invalid_slide`
- `unsupported_command`

La app no presenta mensajes técnicos al usuario. Traduce los códigos a estados
como “La conexión venció” o “No hay una presentación abierta”.

## Lifecycle

```text
inactive
  → pairing
  → pending approval
  → connected
  → disconnected | revoked | expired | error
```

Al cerrar Presenter, se cierran conexiones, se invalidan sesiones activas y
Android vuelve a `disconnected`. Presenter no inicia un puerto ni conserva una
sesión si el operador no habilitó explícitamente el control remoto.

## Gates de implementación

Antes de anunciar la función como disponible:

1. Presenter implementa servidor y pairing en módulos `lvm.remote.0.1`
   propios, sin imports del control remoto heredado.
2. Android puede leer un QR y mostrar `pending approval`, `connected`,
   `expired` y `error` sin fabricar datos de una presentación.
3. Presenter valida token y rechaza comandos no autorizados.
4. La prueba E2E usa un Presenter real y un teléfono Android: pairing,
   siguiente, anterior, ir a diapositiva, limpiar, restaurar, revocar y cierre.
5. No se expone el puerto fuera de la red local ni se publica Service/Worship
   como condición para usar la función.

## Fuera de alcance

- compatibilidad con los protocolos remotos heredados;
- acceso desde Internet;
- NDI, audio, Stage o control de outputs;
- múltiples operadores y permisos por rol;
- QR compartible sin confirmación en Presenter;
- reemplazar M9 Auth.
