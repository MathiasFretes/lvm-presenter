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

    client.send(JSON.stringify({
      schemaVersion: "0.1",
      type: "pair.request",
      requestId: "pair-state-change",
      pairingId: offer.pairingId,
      pairingSecret: offer.pairingSecret,
      device: { id: "phone-state", name: "LVM Phone" },
    }));
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
    expect((await stateChanged).state).toEqual(changed);
    client.close();
  });
});

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
