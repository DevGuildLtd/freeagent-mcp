import { mkdir, readFile, writeFile, chmod } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

export const configDir =
  process.env.FREEAGENT_CONFIG_DIR ?? join(homedir(), ".config", "freeagent-mcp");

const sandbox = process.env.FREEAGENT_SANDBOX === "1";
export const apiBase = sandbox
  ? "https://api.sandbox.freeagent.com/v2"
  : "https://api.freeagent.com/v2";

const appSchema = z.object({
  clientId: z.string(),
  clientSecret: z.string(),
  redirectUri: z.string().url(),
});
export type AppConfig = z.infer<typeof appSchema>;

const tokenSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresAt: z.number(),
});
export type Tokens = z.infer<typeof tokenSchema>;

const tokenFile = join(configDir, sandbox ? "tokens.sandbox.json" : "tokens.json");

export async function loadApp(): Promise<AppConfig> {
  const id = process.env.FREEAGENT_CLIENT_ID;
  const secret = process.env.FREEAGENT_CLIENT_SECRET;
  if (id && secret) {
    return {
      clientId: id,
      clientSecret: secret,
      redirectUri: process.env.FREEAGENT_REDIRECT_URI ?? "http://localhost:8765/callback",
    };
  }
  const raw = await readFile(join(configDir, "app.json"), "utf8");
  return appSchema.parse(JSON.parse(raw));
}

export async function loadTokens(): Promise<Tokens | null> {
  try {
    return tokenSchema.parse(JSON.parse(await readFile(tokenFile, "utf8")));
  } catch {
    return null;
  }
}

export async function saveTokens(tokens: Tokens): Promise<void> {
  await mkdir(configDir, { recursive: true, mode: 0o700 });
  await writeFile(tokenFile, JSON.stringify(tokens, null, 2), { mode: 0o600 });
  await chmod(tokenFile, 0o600);
}
