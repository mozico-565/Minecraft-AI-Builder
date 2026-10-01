const MAX_FRAME_BYTES = 32_768;
const RATE_WINDOW_MS = 10_000;
const MAX_MESSAGES_PER_WINDOW = 60;

export const MINECRAFT_WS_PATH = "/minecraft-ws";
export const MINECRAFT_WS_HEALTH_PATH = "/ws-test/health";

interface SocketEventMap {
  message: { data: unknown };
  close: { code?: number; reason?: string; wasClean?: boolean };
  error: unknown;
}

export interface WorkerSocket {
  accept(): void;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener<K extends keyof SocketEventMap>(type: K, listener: (event: SocketEventMap[K]) => void): void;
}

interface MinecraftHeader {
  version?: unknown;
  requestId?: unknown;
  messageType?: unknown;
  messagePurpose?: unknown;
  eventName?: unknown;
}

interface MinecraftPacket {
  header?: MinecraftHeader;
  body?: unknown;
}

export interface SafePacketMetadata {
  validJson: boolean;
  bytes: number;
  messagePurpose?: string;
  messageType?: string;
  eventName?: string;
  bodyKeys?: string[];
}

function frameBytes(raw: unknown): number {
  if (typeof raw === "string") return new TextEncoder().encode(raw).byteLength;
  if (raw instanceof ArrayBuffer) return raw.byteLength;
  if (ArrayBuffer.isView(raw)) return raw.byteLength;
  if (typeof Blob !== "undefined" && raw instanceof Blob) return raw.size;
  return 0;
}

interface ProtocolLogger {
  log(message: string, metadata?: Record<string, unknown>): void;
  warn(message: string, metadata?: Record<string, unknown>): void;
}

function uuid(): string {
  return crypto.randomUUID();
}

function requestHeader(purpose: "subscribe" | "commandRequest"): Record<string, unknown> {
  return {
    version: 1,
    requestId: uuid(),
    messageType: "commandRequest",
    messagePurpose: purpose
  };
}

export function playerMessageSubscription(): string {
  return JSON.stringify({
    header: requestHeader("subscribe"),
    body: { eventName: "PlayerMessage" }
  });
}

export function safeConnectedCommand(): string {
  return JSON.stringify({
    header: requestHeader("commandRequest"),
    body: {
      version: 1,
      commandLine: "tellraw @s {\"rawtext\":[{\"text\":\"§aMinecraft AI WebSocket connected.\"}]}",
      origin: { type: "player" }
    }
  });
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.length <= 80 ? value : undefined;
}

export function inspectMinecraftPacket(raw: unknown): SafePacketMetadata {
  const bytes = frameBytes(raw);
  if (typeof raw !== "string") return { validJson: false, bytes };
  try {
    const packet = JSON.parse(raw) as MinecraftPacket;
    if (!packet || typeof packet !== "object" || Array.isArray(packet)) return { validJson: false, bytes };
    const header = packet.header && typeof packet.header === "object" && !Array.isArray(packet.header) ? packet.header : {};
    const body = packet.body && typeof packet.body === "object" && !Array.isArray(packet.body)
      ? packet.body as Record<string, unknown>
      : undefined;
    const metadata: SafePacketMetadata = { validJson: true, bytes };
    const messagePurpose = stringField(header.messagePurpose);
    const messageType = stringField(header.messageType);
    const eventName = stringField(header.eventName) ?? stringField(body?.eventName);
    if (messagePurpose) metadata.messagePurpose = messagePurpose;
    if (messageType) metadata.messageType = messageType;
    if (eventName) metadata.eventName = eventName;
    if (body) metadata.bodyKeys = Object.keys(body).slice(0, 16).sort();
    return metadata;
  } catch {
    return { validJson: false, bytes };
  }
}

export function attachMinecraftProtocol(socket: WorkerSocket, logger: ProtocolLogger = console): string {
  const session = uuid().slice(0, 8);
  let windowStarted = Date.now();
  let messagesInWindow = 0;

  socket.accept();
  logger.log("minecraft_ws_connected", { session });
  socket.send(playerMessageSubscription());
  socket.send(safeConnectedCommand());

  socket.addEventListener("message", (event) => {
    const now = Date.now();
    if (now - windowStarted >= RATE_WINDOW_MS) {
      windowStarted = now;
      messagesInWindow = 0;
    }
    messagesInWindow += 1;
    if (messagesInWindow > MAX_MESSAGES_PER_WINDOW) {
      logger.warn("minecraft_ws_rate_limited", { session });
      socket.close(1008, "Rate limit exceeded");
      return;
    }

    const metadata = inspectMinecraftPacket(event.data);
    if (metadata.bytes > MAX_FRAME_BYTES) {
      logger.warn("minecraft_ws_frame_too_large", { session, bytes: metadata.bytes });
      socket.close(1009, "Message too large");
      return;
    }
    if (!metadata.validJson) {
      logger.warn("minecraft_ws_invalid_message", { session, bytes: metadata.bytes });
      return;
    }
    logger.log("minecraft_ws_message", { session, ...metadata });
  });

  socket.addEventListener("close", (event) => {
    const receivedCode = typeof event.code === "number" ? event.code : 1005;
    logger.log("minecraft_ws_disconnected", {
      session,
      code: receivedCode,
      clean: event.wasClean === true
    });
    // Required by older Workers compatibility behavior; harmless after the
    // runtime's automatic close-frame reply became the default.
    const replyCode = receivedCode >= 1000 && receivedCode <= 4999 && receivedCode !== 1005 && receivedCode !== 1006
      ? receivedCode
      : 1000;
    socket.close(replyCode, "Connection closed");
  });
  socket.addEventListener("error", () => logger.warn("minecraft_ws_transport_error", { session }));
  return session;
}

type WorkerResponseInit = ResponseInit & { webSocket: WorkerSocket };

export function upgradeMinecraftWebSocket(request: Request): Response {
  if (request.method !== "GET") return new Response("GET required", { status: 405 });
  if ((request.headers.get("upgrade") ?? "").toLowerCase() !== "websocket") {
    return new Response("Expected Upgrade: websocket", {
      status: 426,
      headers: { "content-type": "text/plain; charset=utf-8", upgrade: "websocket" }
    });
  }

  const Pair = (globalThis as typeof globalThis & {
    WebSocketPair?: new () => { 0: WorkerSocket; 1: WorkerSocket };
  }).WebSocketPair;
  if (!Pair) return new Response("WebSocket runtime unavailable", { status: 503 });
  const pair = new Pair();
  attachMinecraftProtocol(pair[1]);
  return new Response(null, { status: 101, webSocket: pair[0] } as WorkerResponseInit);
}

export function minecraftWebSocketHealth(): Response {
  return new Response(JSON.stringify({
    ok: true,
    service: "minecraft-ws-poc",
    endpoint: MINECRAFT_WS_PATH,
    protocol: "minecraft-command-websocket-v1",
    minecraftClientVerified: false,
    aiBridgeEnabled: false
  }), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}
