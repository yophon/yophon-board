export type BoardWsData = { boardSlug: string };

export class BoardHub {
  private readonly clients = new Map<string, Set<Bun.ServerWebSocket<BoardWsData>>>();

  add(boardSlug: string, ws: Bun.ServerWebSocket<BoardWsData>): void {
    this.getClients(boardSlug).add(ws);
  }

  remove(boardSlug: string, ws: Bun.ServerWebSocket<BoardWsData>): void {
    const clients = this.clients.get(boardSlug);
    if (!clients) return;
    clients.delete(ws);
    if (clients.size === 0) this.clients.delete(boardSlug);
  }

  broadcast(boardSlug: string, message: Record<string, unknown>): void {
    const payload = JSON.stringify(message);
    const clients = this.clients.get(boardSlug);
    if (!clients) return;
    for (const client of clients) {
      try {
        client.send(payload);
      } catch {
        clients.delete(client);
      }
    }
  }

  stats(): { wsClients: number; wsBoards: Record<string, number> } {
    let wsClients = 0;
    const wsBoards: Record<string, number> = {};
    for (const [slug, clients] of this.clients) {
      wsBoards[slug] = clients.size;
      wsClients += clients.size;
    }
    return { wsClients, wsBoards };
  }

  private getClients(boardSlug: string): Set<Bun.ServerWebSocket<BoardWsData>> {
    const existing = this.clients.get(boardSlug);
    if (existing) return existing;
    const next = new Set<Bun.ServerWebSocket<BoardWsData>>();
    this.clients.set(boardSlug, next);
    return next;
  }
}
