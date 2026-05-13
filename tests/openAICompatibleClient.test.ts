import http from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { OpenAICompatibleClient } from "../src/main/llm/OpenAICompatibleClient";

const servers: http.Server[] = [];

afterEach(() => {
  for (const server of servers.splice(0)) server.close();
});

describe("OpenAICompatibleClient", () => {
  it("parses streaming delta content", async () => {
    const { base } = await startChatServer(async (_body, response) => {
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      response.write('data: {"choices":[{"delta":{"content":"hello"}}]}\n\n');
      response.write('data: {"choices":[{"delta":{"content":" stream"}}]}\n\n');
      response.end("data: [DONE]\n\n");
    });

    const client = new OpenAICompatibleClient();
    const result = await client.chat({ baseUrl: base, apiKey: "test-key", model: "test-model" }, [{ role: "user", content: "hi" }]);

    expect(result).toMatchObject({ text: "hello stream", streamingUsed: true, model: "test-model" });
  });

  it("retries non-streaming when a streaming response has no visible content", async () => {
    const streamFlags: boolean[] = [];
    const { base } = await startChatServer(async (body, response) => {
      streamFlags.push(Boolean(body.stream));
      if (body.stream) {
        response.writeHead(200, { "Content-Type": "text/event-stream" });
        response.end('data: {"choices":[{"delta":{}}]}\n\ndata: [DONE]\n\n');
        return;
      }
      sendJson(response, { choices: [{ message: { content: "fallback reply" } }] });
    });

    const client = new OpenAICompatibleClient();
    const result = await client.chat({ baseUrl: base, apiKey: "test-key", model: "test-model" }, [{ role: "user", content: "hi" }]);

    expect(result).toMatchObject({ text: "fallback reply", streamingUsed: false });
    expect(streamFlags).toEqual([true, false]);
  });

  it("parses non-streaming message content arrays", async () => {
    const { base } = await startChatServer(async (body, response) => {
      if (body.stream) {
        response.writeHead(400);
        response.end("stream disabled");
        return;
      }
      sendJson(response, {
        choices: [
          {
            message: {
              content: [
                { type: "text", text: "array " },
                { type: "text", text: "reply" }
              ]
            }
          }
        ]
      });
    });

    const client = new OpenAICompatibleClient();
    const result = await client.chat({ baseUrl: base, apiKey: "test-key", model: "test-model" }, [{ role: "user", content: "hi" }]);

    expect(result.text).toBe("array reply");
    expect(result.streamingUsed).toBe(false);
  });
});

async function startChatServer(handler: (body: Record<string, unknown>, response: http.ServerResponse) => Promise<void> | void): Promise<{ base: string }> {
  const server = http.createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/v1/chat/completions") {
      response.writeHead(404);
      response.end();
      return;
    }
    const body = JSON.parse(await readBody(request)) as Record<string, unknown>;
    await handler(body, response);
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("server did not bind");
  return { base: `http://127.0.0.1:${address.port}/v1` };
}

async function readBody(request: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

function sendJson(response: http.ServerResponse, body: unknown): void {
  response.writeHead(200, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}
