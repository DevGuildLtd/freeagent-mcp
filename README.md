# freeagent-mcp

A small MCP server for the [FreeAgent API v2](https://dev.freeagent.com/docs). It runs on stdio and uses Node 24 (no build step).

## Setup

1. Create an app at <https://dev.freeagent.com/apps> with redirect URI `http://localhost:8765/callback`.
2. Put its credentials in `~/.config/freeagent-mcp/app.json` (mode 600):
   ```json
   {"clientId": "...", "clientSecret": "...", "redirectUri": "http://localhost:8765/callback"}
   ```
   Or set `FREEAGENT_CLIENT_ID` and `FREEAGENT_CLIENT_SECRET`.
3. `npm install`

## Tokens

By default the server keeps OAuth tokens in memory only. Nothing goes to disk. The first FreeAgent call in each server process opens the approval page in your browser and waits up to 3 minutes. When you approve, the call goes on. The tokens die with the process, so every new session needs a new approval.

To keep tokens across sessions, set `FREEAGENT_TOKEN_STORE=file` and run `npm run login` once. Tokens then go to `~/.config/freeagent-mcp/tokens.json` (mode 600) and refresh on their own. Any process running as your user can read that file.

## Add to Claude Code

```sh
claude mcp add freeagent -s user -e FREEAGENT_ALLOW_WRITES=1 -- node /Users/mneveroff/Code/freeagent-mcp/src/index.ts
```

## Tools

| Tool | What it does |
| --- | --- |
| `freeagent_get` | GET any v2 path, with optional pagination |
| `freeagent_company` | Company and current user |
| `freeagent_invoices`, `freeagent_bills`, `freeagent_contacts`, `freeagent_expenses` | Lists with filters, all pages |
| `freeagent_bank_accounts`, `freeagent_bank_transactions` | Banking |
| `freeagent_report` | P&L, balance sheet, trial balance, cashflow |
| `freeagent_write` | POST/PUT/DELETE. Only when `FREEAGENT_ALLOW_WRITES=1` |

## Environment

- `FREEAGENT_TOKEN_STORE=file` saves tokens to disk. Default is `memory`.
- `FREEAGENT_SANDBOX=1` uses `api.sandbox.freeagent.com` and a separate token file.
- `FREEAGENT_ALLOW_WRITES=1` turns on `freeagent_write`. Read-only by default.
- `FREEAGENT_CONFIG_DIR` changes the config folder.

The client retries on HTTP 429 with backoff. FreeAgent allows 120 requests per minute and 3600 per hour.
