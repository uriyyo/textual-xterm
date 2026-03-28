import { ClipboardAddon } from "@xterm/addon-clipboard";
import { FitAddon } from "@xterm/addon-fit";
import { ImageAddon } from "@xterm/addon-image";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal } from "@xterm/xterm";
import { connectTerminalToWS } from "./ws";

function createTerminal(
  container: HTMLElement,
  fontSize: number,
): [Terminal, FitAddon] {
  const terminal = new Terminal({
    allowProposedApi: true,
    fontSize,
    fontFamily: "'Roboto Mono', monospace",
    theme: {
      background: "#0c181f",
    },
  });

  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);

  const clipboardAddon = new ClipboardAddon();
  terminal.loadAddon(clipboardAddon);

  const imageAddon = new ImageAddon({});
  terminal.loadAddon(imageAddon);

  const unicode11Addon = new Unicode11Addon();
  terminal.loadAddon(unicode11Addon);
  terminal.unicode.activeVersion = "11";

  terminal.loadAddon(new WebLinksAddon());

  const webglAddon = new WebglAddon();
  webglAddon.onContextLoss(() => {
    webglAddon.dispose();
  });
  terminal.loadAddon(webglAddon);

  terminal.open(container);
  fitAddon.fit();

  return [terminal, fitAddon];
}

export function startTerminal(
  container: HTMLElement,
  wsUrl: string,
  fontSize: number,
) {
  const [terminal, fitAddon] = createTerminal(container, fontSize);
  connectTerminalToWS(terminal, fitAddon, wsUrl, fontSize);
}
