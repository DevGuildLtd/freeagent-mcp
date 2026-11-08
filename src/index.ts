#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { FreeAgentClient, type Query } from "./client.ts";

const client = new FreeAgentClient();
const allowWrites = process.env.FREEAGENT_ALLOW_WRITES === "1";
const server = new McpServer({ name: "freeagent", version: "0.1.0" });

type Result = { content: { type: "text"; text: string }[]; isError?: boolean };

async function run(fn: () => Promise<unknown>): Promise<Result> {
  try {
    return { content: [{ type: "text", text: JSON.stringify(await fn(), null, 2) }] };
  } catch (e) {
    return { content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }], isError: true };
  }
}

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("YYYY-MM-DD");
const query = z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional();

function list(path: string, q: Query, allPages = true, maxPages = 20) {
  return allPages ? client.getAll(path, q, maxPages) : client.request("GET", path, q).then((r) => r.data);
}

server.registerTool(
  "freeagent_get",
  {
    title: "FreeAgent GET",
    description:
      "Read any FreeAgent API v2 endpoint. `path` is relative to /v2, for example `invoices`, `invoices/123`, " +
      "`bank_transactions`, `accounting/profit_and_loss/summary`, `categories`, `users/me`. " +
      "Docs: https://dev.freeagent.com/docs. List endpoints return 25 items per page by default; set all_pages to follow pagination.",
    inputSchema: {
      path: z.string(),
      query,
      all_pages: z.boolean().default(false),
      max_pages: z.number().int().min(1).max(100).default(20),
    },
    annotations: { readOnlyHint: true },
  },
  ({ path, query: q, all_pages, max_pages }) =>
    run(() => (all_pages ? client.getAll(path, q ?? {}, max_pages) : client.request("GET", path, q ?? {}))),
);

server.registerTool(
  "freeagent_company",
  { title: "Company details", description: "Company info and the current user.", annotations: { readOnlyHint: true } },
  () =>
    run(async () => ({
      company: (await client.request("GET", "company")).data,
      me: (await client.request("GET", "users/me")).data,
    })),
);

server.registerTool(
  "freeagent_invoices",
  {
    title: "List invoices",
    description: "List sales invoices. view: all, recent_open_or_overdue, open, overdue, open_or_overdue, draft, paid, scheduled_to_email, thank_you_emails, reminder_emails, last_N_months.",
    inputSchema: {
      view: z.string().default("all"),
      from_date: date.optional(),
      to_date: date.optional(),
      contact: z.string().optional().describe("Contact URL"),
      project: z.string().optional().describe("Project URL"),
      nested_invoice_items: z.boolean().default(false),
    },
    annotations: { readOnlyHint: true },
  },
  (a) => run(() => list("invoices", { ...a })),
);

server.registerTool(
  "freeagent_bills",
  {
    title: "List bills",
    description: "List purchase bills. view: all, open, overdue, open_or_overdue, paid, recurring, hire_purchase, cis.",
    inputSchema: {
      view: z.string().default("all"),
      from_date: date.optional(),
      to_date: date.optional(),
      contact: z.string().optional(),
      project: z.string().optional(),
    },
    annotations: { readOnlyHint: true },
  },
  (a) => run(() => list("bills", { ...a })),
);

server.registerTool(
  "freeagent_contacts",
  {
    title: "List contacts",
    description: "List contacts. view: all, active, clients, suppliers, active_projects, completed_projects, open_clients, open_suppliers, hidden.",
    inputSchema: { view: z.string().default("active"), sort: z.string().optional() },
    annotations: { readOnlyHint: true },
  },
  (a) => run(() => list("contacts", { ...a })),
);

server.registerTool(
  "freeagent_bank_accounts",
  { title: "List bank accounts", description: "List bank accounts with balances.", annotations: { readOnlyHint: true } },
  () => run(() => list("bank_accounts", {})),
);

server.registerTool(
  "freeagent_bank_transactions",
  {
    title: "List bank transactions",
    description: "List transactions for one bank account. view: all, unexplained, explained, manual, imported, marked_for_review.",
    inputSchema: {
      bank_account: z.string().describe("Bank account URL from freeagent_bank_accounts"),
      view: z.string().default("all"),
      from_date: date.optional(),
      to_date: date.optional(),
    },
    annotations: { readOnlyHint: true },
  },
  (a) => run(() => list("bank_transactions", { ...a })),
);

server.registerTool(
  "freeagent_expenses",
  {
    title: "List expenses",
    description: "List expense claims. view: recent, recurring.",
    inputSchema: { view: z.string().optional(), from_date: date.optional(), to_date: date.optional(), project: z.string().optional() },
    annotations: { readOnlyHint: true },
  },
  (a) => run(() => list("expenses", { ...a })),
);

server.registerTool(
  "freeagent_report",
  {
    title: "Accounting report",
    description: "Run a report: profit_and_loss, balance_sheet, trial_balance, cashflow. Dates are optional for most; cashflow needs both.",
    inputSchema: {
      report: z.enum(["profit_and_loss", "balance_sheet", "trial_balance", "cashflow"]),
      from_date: date.optional(),
      to_date: date.optional(),
      as_at_date: date.optional().describe("balance_sheet only"),
      accounting_period: z.string().optional().describe("profit_and_loss only, e.g. 2024/25"),
    },
    annotations: { readOnlyHint: true },
  },
  ({ report, ...q }) => {
    const path = {
      profit_and_loss: "accounting/profit_and_loss/summary",
      balance_sheet: "accounting/balance_sheet",
      trial_balance: "accounting/trial_balance/summary",
      cashflow: "cashflow",
    }[report];
    return run(() => client.request("GET", path, q).then((r) => r.data));
  },
);

if (allowWrites) {
  server.registerTool(
    "freeagent_write",
    {
      title: "FreeAgent write",
      description:
        "POST, PUT or DELETE on a FreeAgent API v2 endpoint. This changes real accounting data. " +
        "Confirm with the user before every call. Body follows https://dev.freeagent.com/docs, e.g. {\"invoice\": {...}}.",
      inputSchema: {
        method: z.enum(["POST", "PUT", "DELETE"]),
        path: z.string(),
        query,
        body: z.record(z.string(), z.unknown()).optional(),
      },
      annotations: { destructiveHint: true },
    },
    ({ method, path, query: q, body }) => run(() => client.request(method, path, q ?? {}, body)),
  );
}

await server.connect(new StdioServerTransport());
