import postgres from "postgres";

import { IdResolver, MemoryCache } from "@atproto/identity";

const HOUR = 60e3 * 60;
const DAY = HOUR * 24;

export function createIdResolver() {
  return new IdResolver({
    didCache: new MemoryCache(HOUR, DAY),
  });
}

export interface BidirectionalResolver {
  resolveDidToHandle(did: string): Promise<string>;
  resolveDidsToHandles(dids: string[]): Promise<Record<string, string>>;
}

export function createBidirectionalResolver(resolver: IdResolver) {
  return {
    async resolveDidToHandle(did: string): Promise<string> {
      const didDoc = await resolver.did.resolveAtprotoData(did);
      const resolvedHandle = await resolver.handle.resolve(didDoc.handle);
      if (resolvedHandle === did) {
        return didDoc.handle;
      }
      return did;
    },

    async resolveDidsToHandles(
      dids: string[]
    ): Promise<Record<string, string>> {
      const didHandleMap: Record<string, string> = {};
      const resolves = await Promise.all(
        dids.map((did) => this.resolveDidToHandle(did).catch((_) => did))
      );
      for (let i = 0; i < dids.length; i++) {
        didHandleMap[dids[i]] = resolves[i];
      }
      return didHandleMap;
    },
  };
}
const sql = postgres({ database: "bsky" });

const idResolver = createIdResolver();
const { resolveDidToHandle } = createBidirectionalResolver(idResolver);

import { Jetstream } from "@skyware/jetstream";
import WebSocket from 'ws';

const jetstream = new Jetstream({
	ws: WebSocket,
  wantedCollections: [
    "app.bsky.feed.post",
    "app.bsky.feed.like",
    "app.bsky.feed.repost",
  ],
});

jetstream.onCreate("app.bsky.feed.repost", async (evt) => {
  const record = evt.commit.record as any;
  const uri = record.subject.uri
  const [{ count }] =
    await sql`SELECT COUNT(*) as count FROM bsky_urls WHERE post_uri = ${uri}`;
  if (count > 0) {
    console.log("Repost of tracked post");
    await sql`
      INSERT INTO bsky_reposts (did, timestamp, post_uri) VALUES (${evt.did}, ${record.createdAt}, ${uri});
    `;
  }
});

jetstream.onCreate("app.bsky.feed.like",async (evt) => {
  const record = evt.commit.record as any;
  const uri = record.subject.uri
  const [{ count }] =
    await sql`SELECT COUNT(*) as count FROM bsky_urls WHERE post_uri = ${uri}`;
  if (count > 0) {
    console.log("Like on tracked post");
    await sql`
      INSERT INTO bsky_likes (did, timestamp, post_uri) VALUES (${evt.did}, ${record.createdAt}, ${uri});
    `;
  }
});

jetstream.onCreate("app.bsky.feed.post", async (evt) => {
  const record = evt.commit.record as any;
  const post_uri = `at://${evt.did}/app.bsky.feed.post/${evt.commit.rkey}`

  let imported = false;
  if ("reply" in record) {
    const [{ count }] =
      await sql`SELECT COUNT(*) as count FROM bsky_urls WHERE post_uri = ${record.reply.root.uri}`;
    if (count > 0) {
      imported=true;
      console.log("Reply to tracked post");
      await sql`
        INSERT INTO bsky_replies (did, timestamp, post_uri, post_text, root_uri, parent_uri) VALUES (${evt.did}, ${record.createdAt}, ${post_uri}, ${record.text}, ${record.reply.root.uri}, ${record.reply.parent.uri});
      `;
    }
  }
  if ("embed" in record && record.embed.$type === "app.bsky.embed.external") {
    const { uri, thumb, title = '', description = '' } = record.embed.external;
    imported=true;
    console.log([post_uri, record.text]);
    await sql`
      INSERT INTO bsky_urls (did, timestamp, uri, thumb, title, description, post_uri, post_text) VALUES (${
        evt.did
      }, ${record.createdAt}, ${uri}, ${
      thumb ?? null
    }, ${title}, ${description}, ${post_uri}, ${record.text})`;
  }

  if (imported) {
    const [{ count }] =
      await sql`SELECT COUNT(*) as count FROM bsky_users WHERE did = ${evt.did} AND timestamp > NOW() - interval '1 week'`;
    if (Number(count) === 0) {
      const handle = await resolveDidToHandle(evt.did);
      await sql`
        INSERT INTO bsky_users (did, handle, timestamp) VALUES (${evt.did}, ${handle}, NOW()) ON CONFLICT (did) DO UPDATE SET "handle" = EXCLUDED."handle", "timestamp" = NOW();
      `;
    }
  }
});

console.info("Connected to database.");

// Gracefully handle shutdown
process.on("SIGINT", async () => {
  console.info("\nReceived SIGINT (Ctrl+C). Gracefully shutting down...");
  await sql.end();
  process.exit(0);
});

console.info("Started subscription.");
jetstream.start();
