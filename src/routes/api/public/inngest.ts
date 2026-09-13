import { createFileRoute } from "@tanstack/react-router";

/**
 * Endpoint the background scheduler talks to. Requests are signed by Inngest
 * and verified by the handler using the signing key kept on the server.
 */
async function handle(request: Request): Promise<Response> {
  const { inngestHandler } = await import("@/lib/inngest.server");
  return (await inngestHandler(request)) as Response;
}

export const Route = createFileRoute("/api/public/inngest")({
  server: {
    handlers: {
      GET: async ({ request }) => handle(request),
      POST: async ({ request }) => handle(request),
      PUT: async ({ request }) => handle(request),
    },
  },
});
