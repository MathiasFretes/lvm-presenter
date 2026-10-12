import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";

import {
  RemoteTransportServer,
  type RemotePresentationState,
} from "./RemoteTransportServer";

const initialState: RemotePresentationState = {
  show: { id: "culto-general", title: "Culto General" },
  current: { itemIndex: 0, slideIndex: 0, slideCount: 3 },
  output: { isLive: true, isCleared: false },
};

describe("RemoteTransportServer", () => {
  const servers: RemoteTransportServer[] = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.close()));
  });

  it("creates the versioned pairing URL consumed by LVM Presenter Remote", () => {
    const server = new RemoteTransportServer({
      initialState: () => initialState,
      onCommand: () => initialState,
    });
    servers.push(server);

    const link = server.createPairingLink("192.168.1.20", 4319);

    expect(link.url).toContain("lvm-presenter://remote/0.1?");
    expect(link.url).toContain("host=192.168.1.20");
    expect(link.url).toContain("port=4319");
    expect(link.url).toContain(`pairingId=${link.pairingId}`);
  });

  it("pairs only after local approval, applies an allowed command, and sends a snapshot", async () => {
    const pending: string[] = [];
    const applied: string[] = [];
    const server = new RemoteTransportServer({
      initialState: () => initialState,
      onPairingPending: (request) => pending.push(request.pairingId),
      onCommand: ({ command }) => {
        applied.push(command);
        return initialState;
      },
    });
    servers.push(server);
    const port = await server.start();
    const offer = server.createPairing();
    const client = await connect(`ws://127.0.0.1:${port}/lvm-remote/0.1`);

    client.send(
      JSON.stringify({
        schemaVersion: "0.1",
        type: "pair.request",
        requestId: "pair-1",
        pairingId: offer.pairingId,
        pairingSecret: offer.pairingSecret,
        device: { id: "phone-1", name: "LVM Phone" },
      }),
    );
    await expectMessage(client, "pair.pending");
    expect(pending).toEqual([offer.pairingId]);

    const approved = expectMessage(client, "pair.approved");
    const snapshotMessage = expectMessage(client, "state.snapshot");
    const session = server.approvePairing(offer.pairingId);
    await approved;
    const snapshot = await snapshotMessage;
    expect(snapshot.show).toEqual(initialState.show);

    client.send(
      JSON.stringify({
        schemaVersion: "0.1",
        type: "command.next",
        requestId: "next-1",
        sessionToken: session.token,
      }),
    );
    const appliedMessage = await expectMessage(client, "command.applied");
    expect(applied).toEqual(["next"]);
    expect(appliedMessage.state).toEqual(initialState);
    client.close();
  });

  it("rejects an invalid command and closes all listeners", async () => {
    const server = new RemoteTransportServer({
      initialState: () => initialState,
      onCommand: () => initialState,
    });
    servers.push(server);
    const port = await server.start();
    const client = await connect(`ws://127.0.0.1:${port}/lvm-remote/0.1`);
    client.send(
      JSON.stringify({
        schemaVersion: "0.1",
        type: "command.shutdown",
        requestId: "bad",
      }),
    );
    await expectMessage(client, "command.rejected");
    const closed = waitForClose(client);
    await server.close();
    await closed;
  });

  it("publishes a changed Presenter state to an already paired device", async () => {
    const server = new RemoteTransportServer({
      initialState: () => initialState,
      onCommand: () => initialState,
    });
    servers.push(server);
    const port = await server.start();
    const offer = server.createPairing();
    const client = await connect(`ws://127.0.0.1:${port}/lvm-remote/0.1`);

    client.send(
      JSON.stringify({
        schemaVersion: "0.1",
        type: "pair.request",
        requestId: "pair-state-change",
        pairingId: offer.pairingId,
        pairingSecret: offer.pairingSecret,
        device: { id: "phone-state", name: "LVM Phone" },
      }),
    );
    await expectMessage(client, "pair.pending");
    const approved = expectMessage(client, "pair.approved");
    const snapshot = expectMessage(client, "state.snapshot");
    server.approvePairing(offer.pairingId);
    await approved;
    await snapshot;

    const changed = {
      ...initialState,
      current: { itemIndex: 0, slideIndex: 1, slideCount: 3 },
    };
    const stateChanged = expectMessage(client, "state.changed");
    server.broadcastState(changed);
    const message = await stateChanged;
    expect({
      show: message.show,
      current: message.current,
      output: message.output,
    }).toEqual(changed);
    client.close();
  });

  it("runs the Culto QA fixture through navigation, blackout, reconnect, and restore", async () => {
    let state: RemotePresentationState = {
      show: { id: "culto-qa", title: "Culto QA" },
      current: { itemIndex: 0, slideIndex: 0, slideCount: 5 },
      output: { isLive: true, isCleared: false },
    };
    const server = new RemoteTransportServer({
      initialState: () => state,
      onCommand: ({ command, slideIndex }) => {
        const current = state.current;
        if (!current) throw new Error("no_presentation");
        const boundedIndex = (index: number) =>
          Math.max(0, Math.min(current.slideCount - 1, index));
        const nextIndex =
          command === "next"
            ? boundedIndex(current.slideIndex + 1)
            : command === "previous"
              ? boundedIndex(current.slideIndex - 1)
              : command === "goTo"
                ? boundedIndex(slideIndex ?? 0)
                : current.slideIndex;
        state = {
          ...state,
          current: { ...current, slideIndex: nextIndex },
          output: {
            ...state.output,
            isCleared:
              command === "clear"
                ? true
                : command === "restore"
                  ? false
                  : state.output.isCleared,
          },
        };
        return state;
      },
    });
    servers.push(server);
    const port = await server.start();
    const client = await pairClient(server, port, "culto-qa-primary");

    await sendCommandAndExpect(client, "next", stateWithSlide(1));
    await sendCommandAndExpect(client, "next", stateWithSlide(2));
    await sendCommandAndExpect(client, "previous", stateWithSlide(1));
    await sendCommandAndExpect(client, "goTo", stateWithSlide(4), 4);
    await sendCommandAndExpect(client, "clear", {
      ...stateWithSlide(4),
      output: { isLive: true, isCleared: true },
    });

    // A later pairing receives the authoritative blackout snapshot rather
    // than restoring the output as an accidental side effect.
    const reconnectedClient = await pairClient(
      server,
      port,
      "culto-qa-reconnected",
    );
    const reconnectState = await requestSnapshotFromNewPair(
      server,
      port,
      "culto-qa-snapshot",
    );
    expect(reconnectState.output).toEqual({ isLive: true, isCleared: true });
    await sendCommandAndExpect(reconnectedClient, "restore", stateWithSlide(4));
    expect(
      (await expectMessage(client.socket, "state.changed")).output,
    ).toEqual({
      isLive: true,
      isCleared: false,
    });

    // A Presenter-side show change reaches every paired phone immediately.
    state = {
      show: { id: "culto-vespertino", title: "Culto Vespertino" },
      current: { itemIndex: 0, slideIndex: 0, slideCount: 3 },
      output: { isLive: true, isCleared: false },
    };
    const presenterChange = expectMessage(client.socket, "state.changed");
    server.broadcastState(state);
    expect((await presenterChange).show).toEqual(state.show);

    client.socket.close();
    reconnectedClient.socket.close();
  });

  it("rejects a valid remote command before local approval", async () => {
    const server = new RemoteTransportServer({
      initialState: () => initialState,
      onCommand: () => initialState,
    });
    servers.push(server);
    const port = await server.start();
    const client = await connect(`ws://127.0.0.1:${port}/lvm-remote/0.1`);

    client.send(
      JSON.stringify({
        schemaVersion: "0.1",
        type: "command.next",
        requestId: "unapproved-next",
      }),
    );
    const rejected = await expectMessage(client, "command.rejected");
    expect(rejected.code).toBe("unauthorized");
    client.close();
  });

  it("closes approved devices when Presenter stops", async () => {
    const server = new RemoteTransportServer({
      initialState: () => initialState,
      onCommand: () => initialState,
    });
    const port = await server.start();
    const client = await pairClient(server, port, "restart-phone");
    const closed = waitForClose(client.socket);
    await server.close();
    await closed;
  });
});

function stateWithSlide(slideIndex: number): RemotePresentationState {
  return {
    show: { id: "culto-qa", title: "Culto QA" },
    current: { itemIndex: 0, slideIndex, slideCount: 5 },
    output: { isLive: true, isCleared: false },
  };
}

type PairedClient = { socket: WebSocket; sessionToken: string };

async function pairClient(
  server: RemoteTransportServer,
  port: number,
  deviceId: string,
): Promise<PairedClient> {
  const offer = server.createPairing();
  const client = await connect(`ws://127.0.0.1:${port}/lvm-remote/0.1`);
  client.send(
    JSON.stringify({
      schemaVersion: "0.1",
      type: "pair.request",
      requestId: `${deviceId}-pair`,
      pairingId: offer.pairingId,
      pairingSecret: offer.pairingSecret,
      device: { id: deviceId, name: "LVM QA Android" },
    }),
  );
  await expectMessage(client, "pair.pending");
  const approved = expectMessage(client, "pair.approved");
  const snapshot = expectMessage(client, "state.snapshot");
  server.approvePairing(offer.pairingId);
  const approval = await approved;
  await snapshot;
  return { socket: client, sessionToken: approval.sessionToken };
}

async function requestSnapshotFromNewPair(
  server: RemoteTransportServer,
  port: number,
  deviceId: string,
): Promise<Record<string, any>> {
  const offer = server.createPairing();
  const client = await connect(`ws://127.0.0.1:${port}/lvm-remote/0.1`);
  client.send(
    JSON.stringify({
      schemaVersion: "0.1",
      type: "pair.request",
      pairingId: offer.pairingId,
      pairingSecret: offer.pairingSecret,
      device: { id: deviceId, name: "LVM QA Android" },
    }),
  );
  await expectMessage(client, "pair.pending");
  const snapshot = expectMessage(client, "state.snapshot");
  server.approvePairing(offer.pairingId);
  const result = await snapshot;
  client.close();
  return result;
}

async function sendCommandAndExpect(
  client: PairedClient,
  command: "next" | "previous" | "goTo" | "clear" | "restore",
  expected: RemotePresentationState,
  slideIndex?: number,
) {
  const applied = expectMessage(client.socket, "command.applied");
  const changed = expectMessage(client.socket, "state.changed");
  client.socket.send(
    JSON.stringify({
      schemaVersion: "0.1",
      type: `command.${command}`,
      requestId: `command-${command}-${slideIndex ?? ""}`,
      sessionToken: client.sessionToken,
      slideIndex,
    }),
  );
  const appliedMessage = await applied;
  expect(appliedMessage.state).toEqual(expected);
  expect(await changed).toMatchObject({
    show: expected.show,
    current: expected.current,
    output: expected.output,
  });
}

async function connect(url: string): Promise<WebSocket> {
  const client = new WebSocket(url);
  await new Promise<void>((resolve, reject) => {
    client.once("open", resolve);
    client.once("error", reject);
  });
  return client;
}

function expectMessage(
  client: WebSocket,
  type: string,
): Promise<Record<string, any>> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Timed out waiting for ${type}`)),
      2_000,
    );
    client.on("message", function receive(data) {
      const message = JSON.parse(data.toString());
      if (message.type !== type) return;
      clearTimeout(timeout);
      client.off("message", receive);
      resolve(message);
    });
  });
}

function waitForClose(client: WebSocket): Promise<void> {
  return new Promise((resolve) => client.once("close", () => resolve()));
}
