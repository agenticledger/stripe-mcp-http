#!/usr/bin/env node
/**
 * Stripe MCP Server — Streamable HTTP, BROKER-FIRST (auth model "B").
 *
 * This MCP holds ZERO Stripe secrets. It is a *client* of the Connections Broker
 * (https://connectionsbroker.agenticledger.ai), which owns the credentials, runs the
 * connect flow, and vaults + (for OAuth) auto-refreshes each user's token.
 *
 * Per request: derive the caller's `principal`, sign a short-lived JWT, ask the broker
 * POST /token for provider=stripe -> { accessToken }, call the Stripe API
 * directly. If not connected yet, return a connect-on-first-call message (never
 * hard-errors). Raw `Authorization: Bearer <token>` passthrough is an escape hatch.
 *
 * BROKER_AUTH_KIND ('oauth' here): 'oauth' mints a consent URL on
 * connect-on-first-call; 'static' (API-key) instructs an admin to vault the key via
 * the broker POST /credential.
 */

import { randomUUID, createHmac } from 'node:crypto';
import express from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { zodToJsonSchema as _zodToJsonSchema } from 'zod-to-json-schema';
import { StripeClient } from './api-client.js';
import { tools } from './tools.js';
import {
  brokerConfigured,
  brokerBaseUrl,
  brokerClientNamespace,
  brokerProvider,
  resolveToken,
  startConnect,
} from './broker-client.js';

function zodToJsonSchema(schema: any): any {
  return _zodToJsonSchema(schema);
}

// --- Config ---
const PORT = parseInt(process.env.PORT || '3100', 10);
const SERVER_BASE_URL = process.env.SERVER_BASE_URL || `http://localhost:${PORT}`;
const AUTH_KIND = (process.env.BROKER_AUTH_KIND || 'oauth').toLowerCase();

// --- Principal transport (platform-gateway contract) ---
const PRINCIPAL_HEADER = (process.env.BROKER_PRINCIPAL_HEADER || 'x-broker-principal').toLowerCase();
const PRINCIPAL_SIG_HEADER = 'x-broker-principal-sig';
const PRINCIPAL_HMAC_KEY = process.env.BROKER_PRINCIPAL_HMAC_KEY || '';
const FALLBACK_PRINCIPAL = process.env.BROKER_FALLBACK_PRINCIPAL || 'default';

function headerValue(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function derivePrincipal(req: express.Request): { principal: string } | { error: string } {
  const raw = headerValue(req.headers[PRINCIPAL_HEADER]);
  if (raw && raw.trim()) {
    const principal = raw.trim();
    if (PRINCIPAL_HMAC_KEY) {
      const sig = headerValue(req.headers[PRINCIPAL_SIG_HEADER]);
      const expected = createHmac('sha256', PRINCIPAL_HMAC_KEY).update(principal).digest('base64url');
      if (!sig || sig !== expected) {
        return { error: `Missing or invalid ${PRINCIPAL_SIG_HEADER} for the supplied ${PRINCIPAL_HEADER}` };
      }
    }
    return { principal };
  }
  return { principal: FALLBACK_PRINCIPAL };
}

/** Raw passthrough escape hatch — holds no secret. */
function rawPassthrough(req: express.Request): string | null {
  const auth = req.headers.authorization;
  if (!auth) return null;
  const bearer = auth.replace(/^Bearer\s+/i, '').trim();
  return bearer || null;
}

const app = express();
app.use(express.json());

// Claude-CLI OAuth-trap fix: keep OAuth Authorization Server metadata de-advertised.
app.get('/_disabled/oauth-authorization-server', (_req, res) => {
  res.status(404).json({ error: 'not_found' });
});

app.get('/', (_req, res) => {
  res.json({
    name: 'Stripe MCP Server',
    provider: 'AgenticLedger',
    version: '2.0.0',
    description: 'Manage Stripe payments, customers, invoices, subscriptions, and payouts via MCP.',
    mcpEndpoint: '/mcp',
    transport: 'streamable-http',
    tools: tools.length,
    auth: {
      model: 'broker-first',
      description:
        'Credentials are owned by the Connections Broker. On first use the tool returns a one-time connect link; after you connect once, calls just work. No secret is ever pasted into this MCP.',
      broker: brokerBaseUrl,
      principalHeader: PRINCIPAL_HEADER,
      alternativeAuth: {
        type: 'bearer-passthrough',
        description: 'Escape hatch (no secret held): pass a raw Stripe access token as Bearer.',
      },
    },
    configTemplate: {
      mcpServers: {
        stripe: {
          url: `${SERVER_BASE_URL}/mcp`,
        },
      },
    },
    links: {
      health: '/health',
      documentation: 'https://financemcps.agenticledger.ai/stripe/',
    },
  });
});

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    server: 'stripe-mcp-http',
    version: '2.0.0',
    tools: tools.length,
    transport: 'streamable-http',
    authModel: 'broker-first',
    authKind: AUTH_KIND,
    brokerConfigured,
    brokerBaseUrl,
    brokerProvider,
    clientNamespace: brokerConfigured ? brokerClientNamespace : null,
    authModes: [
      'broker-first (default): resolves Stripe via the Connections Broker',
      'bearer-passthrough (escape hatch): Authorization: Bearer <stripe-access-token>',
    ],
  });
});

interface SessionState {
  server: Server;
  transport: StreamableHTTPServerTransport;
}

const sessions = new Map<string, SessionState>();

type ClientResolution =
  | { kind: 'client'; client: StripeClient }
  | { kind: 'connect'; message: string }
  | { kind: 'error'; message: string };

type ClientResolver = () => Promise<ClientResolution>;

function createMCPServer(resolveClient: ClientResolver): Server {
  const server = new Server(
    { name: 'stripe-mcp-server', version: '2.0.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: zodToJsonSchema(tool.inputSchema),
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const tool = tools.find((t) => t.name === name);
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }

    const resolved = await resolveClient();
    if (resolved.kind === 'connect') {
      return { content: [{ type: 'text' as const, text: resolved.message }] };
    }
    if (resolved.kind === 'error') {
      return { content: [{ type: 'text' as const, text: `Error: ${resolved.message}` }], isError: true };
    }

    try {
      const result = await tool.handler(resolved.client, args as any);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: 'text' as const, text: `Error: ${message}` }],
        isError: true,
      };
    }
  });

  return server;
}

async function connectMessage(principal: string): Promise<string> {
  if (AUTH_KIND === 'static') {
    return JSON.stringify(
      {
        status: 'connection_required',
        provider: brokerProvider,
        authKind: 'static',
        message:
          'Stripe is not connected for this caller yet. This is an API-key provider: an admin must vault the key with the Connections Broker (POST /credential for this provider). Once vaulted, run the tool again — it will work.',
      },
      null,
      2
    );
  }
  const started = await startConnect(principal);
  if ('error' in started) {
    return `Stripe isn't connected for this caller yet, and starting a connection failed: ${started.error}`;
  }
  return JSON.stringify(
    {
      status: 'connection_required',
      provider: brokerProvider,
      message:
        'Stripe is not connected for this caller yet. Open the connect link below once (sign in and grant access), then run the tool again — it will work.',
      connectUrl: started.authorizeUrl,
    },
    null,
    2
  );
}

app.post('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  if (sessionId && sessions.has(sessionId)) {
    const { transport } = sessions.get(sessionId)!;
    await transport.handleRequest(req, res, req.body);
    return;
  }

  let resolveClient: ClientResolver;

  const raw = rawPassthrough(req);
  if (raw) {
    const client = new StripeClient(raw);
    resolveClient = async () => ({ kind: 'client', client });
  } else {
    if (!brokerConfigured) {
      res.status(503).json({
        error: 'Broker not configured on this server.',
        hint: 'Set BROKER_INSTALL_BEARER, BROKER_JWT_KEY, BROKER_CLIENT_NAMESPACE (from the broker /register).',
        alternative: { 'Authorization': 'Bearer <your-stripe-access-token>' },
      });
      return;
    }
    const derived = derivePrincipal(req);
    if ('error' in derived) {
      res.status(401).json({ error: derived.error });
      return;
    }
    const principal = derived.principal;
    resolveClient = async () => {
      const tok = await resolveToken(principal);
      if (tok.status === 'connected') {
        return { kind: 'client', client: new StripeClient(tok.accessToken) };
      }
      if (tok.status === 'not_connected') {
        return { kind: 'connect', message: await connectMessage(principal) };
      }
      return { kind: 'error', message: tok.message };
    };
  }

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
  });

  const server = createMCPServer(resolveClient);

  transport.onclose = () => {
    const sid = transport.sessionId;
    if (sid) {
      sessions.delete(sid);
      console.log(`[mcp] Session closed: ${sid}`);
    }
  };

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);

  const newSessionId = transport.sessionId;
  if (newSessionId) {
    sessions.set(newSessionId, { server, transport });
    console.log(`[mcp] New session: ${newSessionId} (mode: ${raw ? 'passthrough' : 'broker'})`);
  }
});

app.get('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (!sessionId || !sessions.has(sessionId)) {
    res.status(400).json({ error: 'Invalid or missing session. Send initialization POST first.' });
    return;
  }
  const { transport } = sessions.get(sessionId)!;
  await transport.handleRequest(req, res);
});

app.delete('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (!sessionId || !sessions.has(sessionId)) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  const { transport, server } = sessions.get(sessionId)!;
  await transport.close();
  await server.close();
  sessions.delete(sessionId);
  res.status(200).json({ status: 'session closed' });
});

app.listen(PORT, () => {
  console.log(`Stripe MCP HTTP Server v2.0.0 (broker-first)`);
  console.log(`  MCP endpoint:   ${SERVER_BASE_URL}/mcp`);
  console.log(`  Health check:   ${SERVER_BASE_URL}/health`);
  console.log(`  Tools:          ${tools.length}`);
  console.log(`  Auth model:     broker-first (${brokerConfigured ? 'broker configured' : 'BROKER NOT CONFIGURED'})`);
  console.log(`  Auth kind:      ${AUTH_KIND}`);
  console.log(`  Broker:         ${brokerBaseUrl}`);
  console.log(`  Provider:       ${brokerProvider}`);
});
