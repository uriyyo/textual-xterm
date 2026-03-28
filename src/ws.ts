import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

function getCellSize(terminal: Terminal): { width: number; height: number } {
  const dimensions = (terminal as any)._core._renderService.dimensions;
  return {
    width: Math.round(dimensions.css.cell.width),
    height: Math.round(dimensions.css.cell.height),
  };
}

export function connectTerminalToWS(
  terminal: Terminal,
  fitAddon: FitAddon,
  wsUrl: string,
  fontSize: number,
) {
  const cols = terminal.cols;
  const rows = terminal.rows;
  const cellSize = getCellSize(terminal);

  const params = new URLSearchParams({
    fontSize: fontSize.toString(),
    width: cols.toString(),
    height: rows.toString(),
    cellWidth: cellSize.width.toString(),
    cellHeight: cellSize.height.toString(),
  });

  const webSocket = new WebSocket(`${wsUrl}?${params.toString()}`);
  webSocket.binaryType = "arraybuffer";

  const sendJSONIfOpen = (data: any) => {
    if (webSocket.readyState === WebSocket.OPEN) {
      webSocket.send(JSON.stringify(data));
    }
  };

  terminal.onData((data) => {
    if (data.includes("\x1b[?") && data.includes("$y")) {
      return;
    }

    sendJSONIfOpen(["stdin", data]);
  });

  terminal.onBinary((data) => {
    sendJSONIfOpen(["stdin", data]);
  });

  let firstByte = false;
  webSocket.addEventListener("message", (event) => {
    if (event.data instanceof ArrayBuffer) {
      if (!firstByte) {
        firstByte = true;
        document.body.classList.add("-first-byte");
      }
      terminal.write(new Uint8Array(event.data));
    } else if (typeof event.data === "string") {
      try {
        const message = JSON.parse(event.data);
        if (Array.isArray(message)) {
          const [type, payload] = message;
          if (type === "open_url") {
            window.open(payload.url, payload.new_tab ? "_blank" : "_self");
          } else if (type === "deliver_file_start") {
            const downloadUrl = `${window.location.origin}/download/${payload}`;
            window.open(downloadUrl, "_blank");
          }
        }
      } catch {}
    }
  });

  terminal.onResize(({ cols, rows }) => {
    const cellSize = getCellSize(terminal);
    sendJSONIfOpen([
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

  terminal.textarea?.addEventListener("focus", () => {
    sendJSONIfOpen(["focus"]);
  });

  terminal.textarea?.addEventListener("blur", () => {
    sendJSONIfOpen(["blur"]);
  });

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
      sendJSONIfOpen(["ping", Date.now()]);
    }, 30000);
    terminal.focus();
  });
}
