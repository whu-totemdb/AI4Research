import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { getWebSocketUrl } from '../services/claudeConnectionService';

export interface TerminalProps {
  sessionId: string;
  onDisconnect?: () => void;
  onOutput?: (data: string) => void;
}

export default function Terminal({ sessionId, onDisconnect, onOutput }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);

  // Store callbacks in refs to avoid re-triggering effect
  const onDisconnectRef = useRef(onDisconnect);
  onDisconnectRef.current = onDisconnect;
  const onOutputRef = useRef(onOutput);
  onOutputRef.current = onOutput;

  useEffect(() => {
    // Guard against StrictMode double-mount
    if (initialized.current) return;
    initialized.current = true;

    const container = containerRef.current;
    if (!container) return;

    let term: XTerm | null = null;
    let ws: WebSocket | null = null;
    let fitAddon: FitAddon | null = null;
    let resizeHandler: (() => void) | null = null;
    let observer: ResizeObserver | null = null;

    // Delay open() until container has dimensions (next frame)
    const rafId = requestAnimationFrame(() => {
      term = new XTerm({
        cursorBlink: true,
        fontSize: 14,
        fontFamily: 'Consolas, Monaco, "Courier New", monospace',
        theme: {
          background: '#1e1e2e',
          foreground: '#cdd6f4',
          cursor: '#f5e0dc',
          selectionBackground: '#585b7066',
          black: '#45475a',
          red: '#f38ba8',
          green: '#a6e3a1',
          yellow: '#f9e2af',
          blue: '#89b4fa',
          magenta: '#f5c2e7',
          cyan: '#94e2d5',
          white: '#bac2de',
          brightBlack: '#585b70',
          brightRed: '#f38ba8',
          brightGreen: '#a6e3a1',
          brightYellow: '#f9e2af',
          brightBlue: '#89b4fa',
          brightMagenta: '#f5c2e7',
          brightCyan: '#94e2d5',
          brightWhite: '#a6adc8',
        },
      });

      fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.loadAddon(new WebLinksAddon());
      term.open(container);
      fitAddon.fit();

      // WebSocket - use connection service to get correct endpoint
      const wsUrl = getWebSocketUrl(sessionId);
      ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';

      ws.onopen = () => {
        term!.writeln('\x1b[32mConnected to terminal session.\x1b[0m\r\n');
        const { rows, cols } = term!;
        ws!.send(`\x01R${rows};${cols}`);
      };

      ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          const bytes = new Uint8Array(event.data);
          term!.write(bytes);
          onOutputRef.current?.(new TextDecoder().decode(bytes));
        } else {
          term!.write(event.data);
          onOutputRef.current?.(event.data);
        }
      };

      ws.onclose = () => {
        term!.writeln('\r\n\x1b[31mConnection closed.\x1b[0m');
        onDisconnectRef.current?.();
      };

      ws.onerror = () => {
        term!.writeln('\r\n\x1b[31mWebSocket error.\x1b[0m');
      };

      term.onData((data) => {
        if (ws!.readyState === WebSocket.OPEN) {
          ws!.send(data);
        }
      });

      // Enable Ctrl+V paste
      term.attachCustomKeyEventHandler((e) => {
        if (e.type === 'keydown' && e.ctrlKey && e.key === 'v') {
          navigator.clipboard.readText().then((text) => {
            if (text && ws!.readyState === WebSocket.OPEN) {
              ws!.send(text);
            }
          }).catch(() => {});
          return false;
        }
        return true;
      });

      // Right-click to paste (like PuTTY/Windows Terminal)
      container.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        navigator.clipboard.readText().then((text) => {
          if (text && ws!.readyState === WebSocket.OPEN) {
            ws!.send(text);
          }
        }).catch(() => {});
      });

      term.onResize(({ rows, cols }) => {
        if (ws!.readyState === WebSocket.OPEN) {
          ws!.send(`\x01R${rows};${cols}`);
        }
      });

      resizeHandler = () => fitAddon!.fit();
      window.addEventListener('resize', resizeHandler);

      observer = new ResizeObserver(() => fitAddon!.fit());
      observer.observe(container);
    });

    return () => {
      cancelAnimationFrame(rafId);
      if (observer) observer.disconnect();
      if (resizeHandler) window.removeEventListener('resize', resizeHandler);
      if (ws && ws.readyState <= WebSocket.OPEN) ws.close();
      if (term) term.dispose();
      initialized.current = false;
    };
  }, [sessionId]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        minHeight: 300,
        backgroundColor: '#1e1e2e',
      }}
    />
  );
}
