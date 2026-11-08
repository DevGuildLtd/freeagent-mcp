import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { apiBase, type AppConfig, type Tokens } from "./config.ts";
import { exchangeToken } from "./client.ts";

export function approvalUrl(app: AppConfig, state: string): string {
  const url = new URL(`${apiBase}/approve_app`);
  url.search = new URLSearchParams({
    client_id: app.clientId,
    response_type: "code",
    redirect_uri: app.redirectUri,
    state,
  }).toString();
  return url.toString();
}

export function interactiveLogin(
  app: AppConfig,
  opts: { timeoutMs: number; onUrl: (url: string) => void },
): Promise<Tokens> {
  const redirect = new URL(app.redirectUri);
  const state = randomBytes(16).toString("hex");
  const url = approvalUrl(app, state);

  return new Promise<Tokens>((resolve, reject) => {
    const timer = setTimeout(() => {
      server.close();
      reject(new Error(`FreeAgent approval timed out. Approve access at:\n${url}\nthen call the tool again.`));
    }, opts.timeoutMs);

    const server = createServer(async (req, res) => {
      const reqUrl = new URL(req.url ?? "/", redirect.origin);
      if (reqUrl.pathname !== redirect.pathname) {
        res.writeHead(404).end();
        return;
      }
      const code = reqUrl.searchParams.get("code");
      if (reqUrl.searchParams.get("state") !== state || !code) {
        res.writeHead(400).end("Bad state or missing code.");
        return;
      }
      try {
        const tokens = await exchangeToken(app, {
          grant_type: "authorization_code",
          code,
          redirect_uri: app.redirectUri,
        });
        res.writeHead(200, { "Content-Type": "text/plain" }).end("FreeAgent access approved. You can close this tab.");
        resolve(tokens);
      } catch (e) {
        res.writeHead(500).end("Token exchange failed.");
        reject(e instanceof Error ? e : new Error(String(e)));
      } finally {
        clearTimeout(timer);
        server.close();
      }
    });

    server.on("error", (e) => {
      clearTimeout(timer);
      reject(new Error(`Cannot listen on ${redirect.host} for the OAuth callback: ${e.message}`));
    });

    server.listen(Number(redirect.port || 80), redirect.hostname, () => {
      opts.onUrl(url);
      if (process.platform === "darwin") execFile("open", [url]);
    });
  });
}
