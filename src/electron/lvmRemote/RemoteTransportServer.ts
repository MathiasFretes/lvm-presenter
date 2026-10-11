import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket, type RawData } from "ws";

import {
  isRemoteCommand,
  RemotePairingFailure,
  RemotePairingService,
  type PairingOffer,
  type PairingPending,
  type RemoteCommand,
  type RemoteSession,
} from "./RemotePairingService";

const REMOTE_PATH = "/lvm-remote/0.1";
const MAX_PAYLOAD_BYTES = 16 * 1024;

export type RemotePresentationState = {
  show: { id: string; title: string } | null;
  current: { itemIndex: number; slideIndex: number; slideCount: number } | null;
  output: { isLive: boolean; isCleared: boolean };
};

export type RemoteCommandRequest = {
  command: RemoteCommand;
  slideIndex?: number;
  session: RemoteSession;
};

export type RemoteTransportOptions = {
  pairing?: RemotePairingService;
  initialState: () => RemotePresentationState;
  onPairingPending?: (pending: PairingPending) => void;
  onCommand: (
    request: RemoteCommandRequest,
  ) => RemotePresentationState | Promise<RemotePresentationState>;
};

type RemoteMessage = {
  schemaVersion: "0.1";
  type: string;
  requestId?: string;
  sessionToken?: string;
  pairingId?: string;
  pairingSecret?: string;
  device?: { id?: string; name?: string };
  slideIndex?: number;
};

/**
 * First-party LAN transport for LVM Presenter Remote 0.1.
 *
 * This deliberately owns a private HTTP/WebSocket server instead of consuming
 * the inherited remote server or socket.io stack. It is inert until `start()`
 * is called by a future Presenter settings/output surface.
 */
export class RemoteTransportServer {
  private readonly pairing: RemotePairingService;
  private readonly initialState: () => RemotePresentationState;
  private readonly onPairingPending?: (pending: PairingPending) => void;
  private readonly onCommand: RemoteTransportOptions["onCommand"];
  private readonly pendingSockets = new Map<string, WebSocket>();
  private readonly authorizedSockets = new Map<WebSocket, string>();
  private server?: Server;
  private socketServer?: WebSocketServer;

  constructor(options: RemoteTransportOptions) {
    this.pairing = options.pairing ?? new RemotePairingService();
    this.initialState = options.initialState;
    this.onPairingPending = options.onPairingPending;
    this.onCommand = options.onCommand;
  }

  createPairing(): PairingOffer {
    return this.pairing.createPairing();
  }

  /**
   * Starts only after an operator enables Presenter Remote. `0.0.0.0` is
   * intentional: a paired Android device lives on the LAN, not loopback.
   * The future UI supplies the QR address; this server never discovers peers
   * or creates Internet-facing routing on its own.
   */
  async start(port = 0, host = "0.0.0.0"): Promise<number> {
    if (this.server) throw new Error("remote_transport_already_started");

    const socketServer = new WebSocketServer({
      noServer: true,
      maxPayload: MAX_PAYLOAD_BYTES,
      perMessageDeflate: false,
    });
    const server = createServer((_, response) => {
      response.writeHead(404);
      response.end();
    });

    socketServer.on("connection", (socket) => this.attachSocket(socket));
    server.on("upgrade", (request, socket, head) => {
      if (
        new URL(request.url ?? "/", "http://localhost").pathname !== REMOTE_PATH
      ) {
        socket.destroy();
        return;
      }
      socketServer.handleUpgrade(request, socket, head, (webSocket) => {
        socketServer.emit("connection", webSocket, request);
      });
    });

    this.server = server;
    this.socketServer = socketServer;
    await new Promise<void>((resolve, reject) => {
      const fail = (error: Error) => {
        server.off("error", fail);
        reject(error);
      };
      server.once("error", fail);
      server.listen(port, host, () => {
        server.off("error", fail);
        resolve();
      });
    });

    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("remote_transport_address_unavailable");
    return address.port;
  }

  approvePairing(pairingId: string): RemoteSession {
    const socket = this.pendingSockets.get(pairingId);
    if (!socket || socket.readyState !== WebSocket.OPEN)
      throw new Error("remote_pairing_socket_unavailable");

    const session = this.pairing.approvePairing(pairingId);
    this.pendingSockets.delete(pairingId);
    this.authorizedSockets.set(socket, session.token);
    this.send(socket, {
      type: "pair.approved",
      sessionToken: session.token,
      expiresAt: session.expiresAt,
    });
    this.sendState(socket, "state.snapshot", this.initialState());
    return session;
  }

  broadcastState(state: RemotePresentationState) {
    for (const socket of this.authorizedSockets.keys())
      this.sendState(socket, "state.changed", state);
  }

  async close() {
    const activeSockets = new Set([
      ...(this.socketServer?.clients.values() ?? []),
      ...this.authorizedSockets.keys(),
      ...this.pendingSockets.values(),
    ]);
    for (const socket of activeSockets) socket.terminate();
    this.authorizedSockets.clear();
    this.pendingSockets.clear();
    this.pairing.close();

    const socketServer = this.socketServer;
    const server = this.server;
    this.socketServer = undefined;
    this.server = undefined;
    if (socketServer) socketServer.close();
    if (server) {
      server.closeAllConnections?.();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  private attachSocket(socket: WebSocket) {
    socket.on("message", (data) => void this.handleMessage(socket, data));
    socket.on("close", () => {
      this.authorizedSockets.delete(socket);
      for (const [pairingId, pendingSocket] of this.pendingSockets) {
        if (pendingSocket === socket) this.pendingSockets.delete(pairingId);
      }
    });
    socket.on("error", () => socket.close());
  }

  private async handleMessage(socket: WebSocket, data: RawData) {
    const message = parseMessage(data);
    if (!message) {
      this.send(socket, { type: "error", code: "invalid_message" });
      return;
    }

    try {
      if (message.type === "pair.request") {
        const pending = this.pairing.requestPairing({
          pairingId: message.pairingId ?? "",
          pairingSecret: message.pairingSecret ?? "",
          device: {
            id: message.device?.id ?? "",
            name: message.device?.name ?? "",
          },
        });
        this.pendingSockets.set(pending.pairingId, socket);
        this.send(socket, {
          type: "pair.pending",
          requestId: message.requestId,
        });
        this.onPairingPending?.(pending);
        return;
      }

      if (!message.type.startsWith("command.")) {
        this.send(socket, {
          type: "error",
          requestId: message.requestId,
          code: "unsupported_command",
        });
        return;
      }

      const command = message.type.slice("command.".length);
      if (!isRemoteCommand(command)) {
        this.send(socket, {
          type: "command.rejected",
          requestId: message.requestId,
          code: "unsupported_command",
        });
        return;
      }
      if (!message.sessionToken) {
        this.send(socket, {
          type: "command.rejected",
          requestId: message.requestId,
          code: "unauthorized",
        });
        return;
      }
      if (
        command === "goTo" &&
        (!Number.isInteger(message.slideIndex) ||
          (message.slideIndex ?? -1) < 0)
      ) {
        this.send(socket, {
          type: "command.rejected",
          requestId: message.requestId,
          code: "invalid_slide",
        });
        return;
      }

      const session = this.pairing.authorize(message.sessionToken);
      this.authorizedSockets.set(socket, session.token);
      const state = await this.onCommand({
        command,
        slideIndex: message.slideIndex,
        session,
      });
      this.send(socket, {
        type: "command.applied",
        requestId: message.requestId,
        state,
      });
    } catch (error) {
      const code =
        error instanceof RemotePairingFailure ? error.code : "no_presentation";
      this.send(socket, {
        type: message.type.startsWith("command.")
          ? "command.rejected"
          : "pair.rejected",
        requestId: message.requestId,
        code,
      });
    }
  }

  private sendState(
    socket: WebSocket,
    type: "state.snapshot" | "state.changed",
    state: RemotePresentationState,
  ) {
    this.send(socket, { type, ...state });
  }

  private send(socket: WebSocket, message: Record<string, unknown>) {
    if (socket.readyState === WebSocket.OPEN)
      socket.send(JSON.stringify({ schemaVersion: "0.1", ...message }));
  }
}

function parseMessage(data: RawData): RemoteMessage | undefined {
  if (Buffer.byteLength(data.toString()) > MAX_PAYLOAD_BYTES) return undefined;
  try {
    const value: unknown = JSON.parse(data.toString());
    if (!value || typeof value !== "object") return undefined;
    const message = value as RemoteMessage;
    return message.schemaVersion === "0.1" && typeof message.type === "string"
      ? message
      : undefined;
  } catch {
    return undefined;
  }
}
