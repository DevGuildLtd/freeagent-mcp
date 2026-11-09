# freeagent-mcp

An MCP server for the [FreeAgent](https://www.freeagent.com) accounting API (v2). It lets Claude, Cursor or any other MCP client read your FreeAgent data, and optionally change it.

It runs on your own computer over stdio. There is no hosted service and no build step.

## Compatibility

| | Supported |
| --- | --- |
| Node.js | 24 or newer (runs the TypeScript source directly) |
| OS | macOS (tested), Linux, Windows |
| MCP clients | Claude Code, Claude Desktop, Cursor, VS Code, and any other client that runs stdio servers |
| FreeAgent | Any company account. UK, US and universal companies use the same API. Accountancy Practice API is not supported. |

Check your Node version with `node -v`. Install Node 24 from <https://nodejs.org> or with `nvm install 24`.

## 1. Create your own FreeAgent app

Every person creates their own app. Do not share a client secret.

1. Sign in at <https://dev.freeagent.com> with your FreeAgent login.
2. Go to **My Apps**, then **Create New App**.
3. Fill in:
   - **Name:** anything, for example `My FreeAgent MCP`
   - **OAuth Redirect URIs:** `http://localhost:8765/callback`
4. Save. Copy the **OAuth identifier** and the **secret**. FreeAgent shows the secret only once.

To test without real data, also create a sandbox company at <https://signup.sandbox.freeagent.com/signup> and set `FREEAGENT_SANDBOX=1` (see below).

## 2. Install

```sh
git clone https://github.com/DevGuildLtd/freeagent-mcp.git
cd freeagent-mcp
npm ci
```

## 3. Save the app credentials

Create `~/.config/freeagent-mcp/app.json`:

```json
{
  "clientId": "YOUR_OAUTH_IDENTIFIER",
  "clientSecret": "YOUR_SECRET",
  "redirectUri": "http://localhost:8765/callback"
}
```

On macOS or Linux, make it private:

```sh
chmod 700 ~/.config/freeagent-mcp && chmod 600 ~/.config/freeagent-mcp/app.json
```

On Windows the folder is `%USERPROFILE%\.config\freeagent-mcp`.

Instead of the file you can set `FREEAGENT_CLIENT_ID` and `FREEAGENT_CLIENT_SECRET` in the client config (see step 4). This works well with a password manager, for example `op run` from 1Password.

## 4. Add it to your MCP client

Use the full path to your clone in place of `/path/to/freeagent-mcp`.

### Claude Code

```sh
claude mcp add freeagent -s user -- node /path/to/freeagent-mcp/src/index.ts
```

With writes turned on:

```sh
claude mcp add freeagent -s user -e FREEAGENT_ALLOW_WRITES=1 -- node /path/to/freeagent-mcp/src/index.ts
```

### Claude Desktop, Cursor, VS Code and others

Add this to the client's MCP config file. For Claude Desktop that is `claude_desktop_config.json` (Settings, Developer, Edit Config). For Cursor it is `~/.cursor/mcp.json`.

```json
{
  "mcpServers": {
    "freeagent": {
      "command": "node",
      "args": ["/path/to/freeagent-mcp/src/index.ts"],
      "env": {
        "FREEAGENT_ALLOW_WRITES": "0"
      }
    }
  }
}
```

VS Code uses `"servers"` in place of `"mcpServers"` in `.vscode/mcp.json`.

If the client cannot find `node` (common with nvm and Claude Desktop), put the full path from `which node` in `command`.

## 5. First use and login

Ask your client something like "list my open FreeAgent invoices".

The first FreeAgent call opens the FreeAgent approval page in your browser. Sign in if you need to and click **Approve**. The call then goes on. You have 3 minutes. If the browser does not open, the tool error shows the link.

By default the tokens stay in memory only. Nothing goes to disk, and you approve again in each new session. To stay logged in across sessions:

```sh
npm run login
```

and set `FREEAGENT_TOKEN_STORE=file` in the client config. Tokens then go to `~/.config/freeagent-mcp/tokens.json` and refresh on their own. Any program running as your user can read that file.

## Tools

| Tool | What it does |
| --- | --- |
| `freeagent_get` | GET any v2 endpoint, for example `invoices`, `categories`, `users/me`. Can follow all pages. |
| `freeagent_company` | Company details and the signed-in user |
| `freeagent_invoices` | Sales invoices, with view and date filters |
| `freeagent_bills` | Purchase bills |
| `freeagent_contacts` | Clients and suppliers |
| `freeagent_expenses` | Expense claims |
| `freeagent_bank_accounts` | Bank accounts and balances |
| `freeagent_bank_transactions` | Transactions for one bank account |
| `freeagent_report` | Profit and loss, balance sheet, trial balance, cashflow |
| `freeagent_write` | POST, PUT or DELETE any endpoint. Only when `FREEAGENT_ALLOW_WRITES=1`. |

API reference: <https://dev.freeagent.com/docs>

## Settings

All settings are environment variables.

| Variable | Default | Meaning |
| --- | --- | --- |
| `FREEAGENT_ALLOW_WRITES` | off | `1` adds the `freeagent_write` tool |
| `FREEAGENT_TOKEN_STORE` | `memory` | `file` keeps tokens in `tokens.json` |
| `FREEAGENT_SANDBOX` | off | `1` uses `api.sandbox.freeagent.com` and a separate token file |
| `FREEAGENT_CLIENT_ID`, `FREEAGENT_CLIENT_SECRET` | none | Use these in place of `app.json` |
| `FREEAGENT_REDIRECT_URI` | `http://localhost:8765/callback` | Must match the app on the developer portal |
| `FREEAGENT_CONFIG_DIR` | `~/.config/freeagent-mcp` | Where `app.json` and tokens live |
| `FREEAGENT_NO_BROWSER` | off | `1` stops the browser from opening. Use the link from the error. |

## Security

- The server acts as the FreeAgent user who approves it, with that user's full permission level. FreeAgent apps have no scopes. For a safer setup, approve with a FreeAgent user that has a lower permission level.
- Writes are off by default. With writes on, an agent can create, change and delete records, and some actions cannot be undone, for example filing a VAT return or emailing an invoice.
- To cut off access, remove the app from your FreeAgent account settings, or revoke the secret on the developer portal.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `Cannot listen on localhost:8765` | Another session is waiting for approval, or another program uses the port. Finish that login, or change the port in both the app's redirect URI and `FREEAGENT_REDIRECT_URI`. |
| `ENOENT ... app.json` | Do step 3. |
| `redirect_uri` error on the approval page | The redirect URI in `app.json` must match the one on the developer portal exactly. |
| `node: bad option` or syntax error in `.ts` | Node is older than 24. |
| HTTP 429 | FreeAgent allows 120 requests per minute and 3600 per hour. The server waits and tries again. |

## Development

```sh
npm run typecheck
FREEAGENT_SANDBOX=1 npm start
```

## License

MIT. See [LICENSE](LICENSE).
