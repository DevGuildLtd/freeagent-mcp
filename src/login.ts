import { loadApp, saveTokens } from "./config.ts";
import { interactiveLogin } from "./auth.ts";

const tokens = await interactiveLogin(await loadApp(), {
  timeoutMs: 5 * 60_000,
  onUrl: (url) => console.log(`Open this URL to approve access:\n\n${url}\n`),
});
await saveTokens(tokens);
console.log("Login done. Tokens saved to file. Set FREEAGENT_TOKEN_STORE=file to use them.");
