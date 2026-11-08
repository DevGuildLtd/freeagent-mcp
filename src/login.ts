import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { apiBase, loadApp } from "./config.ts";
import { exchangeToken } from "./client.ts";

const app = await loadApp();
const redirect = new URL(app.redirectUri);
const state = randomBytes(16).toString("hex");

const authUrl = new URL(`${apiBase}/approve_app`);
authUrl.search = new URLSearchParams({
  client_id: app.clientId,
  response_type: "code",
  redirect_uri: app.redirectUri,
  state,
}).toString();

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", redirect.origin);
  if (url.pathname !== redirect.pathname) {
    res.writeHead(404).end();
    return;
  }
  const code = url.searchParams.get("code");
  if (url.searchParams.get("state") !== state || !code) {
    res.writeHead(400).end("Bad state or missing code.");
    return;
  }
  try {
    await exchangeToken(app, { grant_type: "authorization_code", code, redirect_uri: app.redirectUri });
    res.writeHead(200, { "Content-Type": "text/plain" }).end("FreeAgent login done. You can close this tab.");
    console.log("Login done. Tokens saved.");
  } catch (e) {
    res.writeHead(500).end(String(e));
    console.error(e);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});

server.listen(Number(redirect.port || 80), redirect.hostname, () => {
  console.log(`Open this URL to approve access:\n\n${authUrl}\n`);
  if (process.platform === "darwin") execFile("open", [authUrl.toString()]);
});
