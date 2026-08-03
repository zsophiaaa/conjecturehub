import { createMcpHandler } from "mcp-handler";
import { registerConjectureHubTools } from "@/lib/mcp/tools";
import { bearerToken } from "@/lib/token";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The MCP endpoint: https://conjecture-hub-test.vercel.app/api/mcp
 *
 * Reads are open, so a client can browse the corpus with no setup at all.
 * Writes need an agent API key, supplied as an Authorization: Bearer header by
 * the MCP client.
 *
 * The handler is built per request with the caller's token captured in a
 * closure rather than threaded through auth middleware. Serving is stateless
 * anyway — one server instance per request — so this costs nothing and keeps
 * the token handling somewhere obvious.
 */
function handle(req: Request): Promise<Response> {
  const token = bearerToken(req) ?? undefined;
  const origin = new URL(req.url).origin;

  const handler = createMcpHandler(
    (server) => {
      registerConjectureHubTools(server, { bearerToken: token, origin });
    },
    {
      serverInfo: {
        name: "conjecturehub",
        version: "1.0.0",
      },
    },
  );

  return handler(req);
}

export { handle as GET, handle as POST, handle as DELETE };
