import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

function getCellSize(terminal: Terminal): { width: number; height: number } {
  const dimensions = (terminal as any)._core._renderService.dimensions;
  return {
    width: Math.round(dimensions.css.cell.width),
    height: Math.round(dimensions.css.cell.height),
  };
}

function buildWebSocketUrl(
  terminal: Terminal,
  wsUrl: string,
  fontSize: number,
): string {
  const cellSize = getCellSize(terminal);
  const params = new URLSearchParams({
    fontSize: fontSize.toString(),
    width: terminal.cols.toString(),
    height: terminal.rows.toString(),
    cellWidth: cellSize.width.toString(),
    cellHeight: cellSize.height.toString(),
  });
  return `${wsUrl}?${params.toString()}`;
}

function handleOpenUrl(payload: { url: string; new_tab?: boolean }) {
  window.open(payload.url, payload.new_tab ? "_blank" : "_self");
}

function handleDeliverFile(payload: string) {
  const downloadUrl = `${window.location.origin}/download/${payload}`;
  window.open(downloadUrl, "_blank");
}

const jsonCommandHandlers: Record<string, (payload: any) => void> = {
  open_url: handleOpenUrl,
  deliver_file_start: handleDeliverFile,
};

function handleJSONCommand(data: string) {
  try {
    const message = JSON.parse(data);
    if (!Array.isArray(message)) return;

    const [type, payload] = message;
    jsonCommandHandlers[type]?.(payload);
  } catch {}
}

function setupTerminalInput(
  terminal: Terminal,
  sendJSON: (data: any) => void,
) {
  terminal.onData((data) => {
    if (data.includes("\x1b[?") && data.includes("$y")) {
      return;
    }
    sendJSON(["stdin", data]);
  });

  terminal.onBinary((data) => {
    sendJSON(["stdin", data]);
  });
}

function setupWebSocketMessages(terminal: Terminal, webSocket: WebSocket) {
  let firstByte = false;

  webSocket.addEventListener("message", (event) => {
    if (event.data instanceof ArrayBuffer) {
      if (!firstByte) {
        firstByte = true;
        document.body.classList.add("-first-byte");
      }
      terminal.write(new Uint8Array(event.data));
    } else if (typeof event.data === "string") {
      handleJSONCommand(event.data);
    }
  });
}

function setupResize(
  terminal: Terminal,
  fitAddon: FitAddon,
  sendJSON: (data: any) => void,
) {
  terminal.onResize(({ cols, rows }) => {
    const cellSize = getCellSize(terminal);
    sendJSON([
      "resize",
      {
        width: cols,
        height: rows,
        cellWidth: cellSize.width,
        cellHeight: cellSize.height,
      },
    ]);
  });

  window.addEventListener("resize", () => {
    fitAddon.fit();
  });
}

function setupFocusEvents(
  terminal: Terminal,
  sendJSON: (data: any) => void,
) {
  terminal.textarea?.addEventListener("focus", () => {
    sendJSON(["focus"]);
  });

  terminal.textarea?.addEventListener("blur", () => {
    sendJSON(["blur"]);
  });
}

function setupWebSocketLifecycle(
  terminal: Terminal,
  webSocket: WebSocket,
  sendJSON: (data: any) => void,
) {
  let pingInterval: ReturnType<typeof setInterval> | null = null;

  webSocket.addEventListener("close", () => {
    if (pingInterval !== null) {
      clearInterval(pingInterval);
      pingInterval = null;
    }
    document.body.classList.add("-closed");
  });

  webSocket.addEventListener("open", () => {
    pingInterval = setInterval(() => {
      sendJSON(["ping", Date.now()]);
    }, 30000);
    terminal.focus();
  });
}

export function connectTerminalToWS(
  terminal: Terminal,
  fitAddon: FitAddon,
  wsUrl: string,
  fontSize: number,
) {
  const url = buildWebSocketUrl(terminal, wsUrl, fontSize);
  const webSocket = new WebSocket(url);
  webSocket.binaryType = "arraybuffer";

  const sendJSON = (data: any) => {
    if (webSocket.readyState === WebSocket.OPEN) {
      webSocket.send(JSON.stringify(data));
    }
  };

  setupTerminalInput(terminal, sendJSON);
  setupWebSocketMessages(terminal, webSocket);
  setupResize(terminal, fitAddon, sendJSON);
  setupFocusEvents(terminal, sendJSON);
  setupWebSocketLifecycle(terminal, webSocket, sendJSON);
}
