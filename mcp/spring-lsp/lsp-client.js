// A minimal, spec-compliant LSP client over stdio: Content-Length framing,
// JSON-RPC request/response correlation, the initialize/initialized
// handshake, and just enough document sync (didOpen/didClose) for one-shot
// navigation queries. Deliberately not a generic "any language, any editor"
// framework - built for exactly what mcp/java-lsp and mcp/spring-lsp need
// (spawn one real LSP server, keep it alive, answer position-based queries
// against it) and copied verbatim between the two packages rather than
// pulled in as a shared npm dependency, matching this repo's mcp/ packages
// being independently installable (see plugins/'s per-package tarball
// rationale in the root CLAUDE.md for the same reasoning applied there).
//
// Wire protocol and the exact client capabilities needed to avoid the
// server crashing during initialize were verified against two real
// servers (Eclipse JDT LS / jdtls, and VMware's spring-boot-language-server
// 2.5.0-SNAPSHOT) during development - see mcp/java-lsp/README.md and
// mcp/spring-lsp/README.md's Status sections for what was actually run.

import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";

const CONTENT_LENGTH_RE = /Content-Length: (\d+)/i;

// A full-ish client capabilities object, not a minimal one. Discovered the
// hard way: spring-boot-language-server throws an internal NullPointerException
// during initialize (JdtLsProjectCache.initialize -> getExecuteCommandProvider()
// returns null) when the client's capabilities.workspace.executeCommand isn't
// declared - it seems to size its own ServerCapabilities.executeCommandProvider
// off what the client claims to support. jdtls didn't need this, but sending
// it doesn't hurt jdtls either, so one shared capabilities object works for
// both rather than branching per server.
function defaultClientCapabilities() {
  return {
    textDocument: {
      hover: { contentFormat: ["plaintext", "markdown"] },
      definition: {},
      typeDefinition: {},
      implementation: {},
      references: {},
      documentSymbol: {},
      callHierarchy: {},
      synchronization: { didSave: true, willSave: false, willSaveWaitUntil: false },
      publishDiagnostics: { relatedInformation: true },
    },
    workspace: {
      workspaceFolders: true,
      symbol: {},
      executeCommand: { dynamicRegistration: false },
      didChangeConfiguration: { dynamicRegistration: false },
      didChangeWatchedFiles: { dynamicRegistration: false },
      configuration: true,
    },
    window: { workDoneProgress: false },
  };
}

export class LspClientError extends Error {}

// One LspClient instance = one spawned server process = one workspace root.
// Not pooled, not respawned automatically on crash - the MCP server module
// that owns an instance is responsible for deciding what "the server died"
// means for in-flight and future tool calls (see server.js's getClient()).
export class LspClient {
  #command;
  #args;
  #spawnOptions;
  #rootPath;
  #child;
  #buf = Buffer.alloc(0);
  #nextId = 1;
  #pending = new Map();
  #diagnostics = new Map(); // uri -> Diagnostic[] from the last publishDiagnostics
  #openDocs = new Map(); // uri -> version
  #initializeResult;
  #dead = false;
  #deadReason;
  #log;

  constructor({ command, args = [], spawnOptions = {}, rootPath, log = () => {} }) {
    this.#command = command;
    this.#args = args;
    this.#spawnOptions = spawnOptions;
    this.#rootPath = rootPath;
    this.#log = log;
  }

  get isAlive() {
    return this.#child && !this.#dead;
  }

  async start() {
    this.#child = spawn(this.#command, this.#args, {
      ...this.#spawnOptions,
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.#child.stdout.on("data", (chunk) => this.#onData(chunk));
    this.#child.stderr.on("data", (chunk) => this.#log("stderr", chunk.toString("utf8")));
    this.#child.on("error", (err) => this.#markDead(`spawn error: ${err.message}`));
    this.#child.on("exit", (code, signal) => this.#markDead(`process exited (code=${code}, signal=${signal})`));

    const rootUri = `file://${this.#rootPath}`;
    this.#initializeResult = await this.request("initialize", {
      processId: process.pid,
      rootUri,
      workspaceFolders: [{ uri: rootUri, name: "workspace" }],
      capabilities: defaultClientCapabilities(),
      initializationOptions: {},
    });
    this.notify("initialized", {});
    return this.#initializeResult;
  }

  get capabilities() {
    return this.#initializeResult?.capabilities;
  }

  #markDead(reason) {
    if (this.#dead) return;
    this.#dead = true;
    this.#deadReason = reason;
    this.#log("lifecycle", reason);
    for (const { reject } of this.#pending.values()) {
      reject(new LspClientError(`LSP server unavailable: ${reason}`));
    }
    this.#pending.clear();
  }

  #send(obj) {
    if (this.#dead) throw new LspClientError(`LSP server unavailable: ${this.#deadReason}`);
    const json = JSON.stringify(obj);
    const header = `Content-Length: ${Buffer.byteLength(json, "utf8")}\r\n\r\n`;
    this.#child.stdin.write(header + json);
  }

  request(method, params, { timeoutMs = 30_000 } = {}) {
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.#pending.has(id)) {
          this.#pending.delete(id);
          reject(new LspClientError(`Timed out waiting for response to ${method} (id=${id})`));
        }
      }, timeoutMs);
      this.#pending.set(id, {
        resolve: (v) => {
          clearTimeout(timeout);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timeout);
          reject(e);
        },
      });
      try {
        this.#send({ jsonrpc: "2.0", id, method, params });
      } catch (err) {
        this.#pending.delete(id);
        clearTimeout(timeout);
        reject(err);
      }
    });
  }

  notify(method, params) {
    this.#send({ jsonrpc: "2.0", method, params });
  }

  #onData(chunk) {
    this.#buf = Buffer.concat([this.#buf, chunk]);
    while (true) {
      const headerEnd = this.#buf.indexOf("\r\n\r\n");
      if (headerEnd === -1) return;
      const header = this.#buf.subarray(0, headerEnd).toString("utf8");
      const match = CONTENT_LENGTH_RE.exec(header);
      if (!match) {
        this.#log("protocol", `Malformed LSP header, dropping: ${header.slice(0, 200)}`);
        this.#buf = this.#buf.subarray(headerEnd + 4);
        continue;
      }
      const length = Number(match[1]);
      const bodyStart = headerEnd + 4;
      if (this.#buf.length < bodyStart + length) return;
      const body = this.#buf.subarray(bodyStart, bodyStart + length).toString("utf8");
      this.#buf = this.#buf.subarray(bodyStart + length);
      this.#handleMessage(body);
    }
  }

  #handleMessage(body) {
    let msg;
    try {
      msg = JSON.parse(body);
    } catch {
      this.#log("protocol", `Malformed JSON from LSP server, dropping: ${body.slice(0, 200)}`);
      return;
    }
    if (msg.id !== undefined && (msg.result !== undefined || msg.error !== undefined)) {
      const pending = this.#pending.get(msg.id);
      if (!pending) return;
      this.#pending.delete(msg.id);
      if (msg.error) pending.reject(new LspClientError(`${msg.error.message} (code ${msg.error.code})`));
      else pending.resolve(msg.result);
      return;
    }
    if (msg.method === "textDocument/publishDiagnostics") {
      this.#diagnostics.set(msg.params.uri, msg.params.diagnostics ?? []);
      return;
    }
    // Requests *from* the server (client/registerCapability, workspace/configuration,
    // etc.) need a response or the server will sit there waiting - reply with a
    // generic success/empty so it doesn't stall. Nothing this client's tool
    // surface needs actually depends on the content of these replies.
    if (msg.id !== undefined && msg.method) {
      this.#send({ jsonrpc: "2.0", id: msg.id, result: null });
    }
  }

  async openDocument(uri, languageId, text) {
    const version = (this.#openDocs.get(uri) ?? 0) + 1;
    this.#openDocs.set(uri, version);
    this.notify("textDocument/didOpen", { textDocument: { uri, languageId, version, text } });
  }

  async openFile(absolutePath, languageId) {
    const uri = `file://${absolutePath}`;
    const text = await readFile(absolutePath, "utf8");
    await this.openDocument(uri, languageId, text);
    return uri;
  }

  // Tool calls are one-shot ("what does this file look like right now"),
  // and the file on disk may have changed since a previous call opened it
  // (the agent's edit tool writes straight to disk) - re-issuing didOpen on
  // an already-open document is invalid per the LSP spec, so this sends a
  // full-document didChange instead when the uri is already tracked, and
  // only didOpen the first time. Always returns the uri the query methods
  // below should use.
  async syncFile(absolutePath, languageId) {
    const uri = `file://${absolutePath}`;
    const text = await readFile(absolutePath, "utf8");
    if (this.#openDocs.has(uri)) {
      const version = this.#openDocs.get(uri) + 1;
      this.#openDocs.set(uri, version);
      this.notify("textDocument/didChange", {
        textDocument: { uri, version },
        contentChanges: [{ text }],
      });
    } else {
      await this.openDocument(uri, languageId, text);
    }
    return uri;
  }

  closeDocument(uri) {
    this.#openDocs.delete(uri);
    this.#diagnostics.delete(uri);
    this.notify("textDocument/didClose", { textDocument: { uri } });
  }

  getDiagnostics(uri) {
    return this.#diagnostics.get(uri) ?? [];
  }

  async shutdown() {
    if (this.#dead) return;
    try {
      await this.request("shutdown", null, { timeoutMs: 5_000 });
      this.notify("exit", null);
    } catch {
      // best-effort - fall through to kill() regardless
    }
    this.#child?.kill();
  }
}
