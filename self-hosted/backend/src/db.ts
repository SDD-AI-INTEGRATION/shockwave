import { BadRequestException } from "@nestjs/common";
import type { Pool, PoolClient } from "pg";
import type { z } from "zod";
import type { User } from "./security.js";

export async function transaction<T>(
  db: Pool,
  run: (client: PoolClient) => Promise<T>,
) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await run(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function audit(
  client: Pool | PoolClient,
  user: User,
  action: string,
  resourceId: string,
) {
  await client.query(
    "INSERT INTO audit_logs(user_id,action,resource_id) VALUES($1,$2,$3)",
    [user.id, action, resourceId],
  );
}

export function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success)
    throw new BadRequestException(
      result.error.issues
        .map((i) => (i.path.length ? `${i.path.join(".")}: ` : "") + i.message)
        .join("\n"),
    );
  return result.data;
}

/** SQL fragment: projects visible to user ($1 role, $2 user id), alias p. */
export const visibleProjects = `p.archived_at IS NULL AND ($1='admin' OR p.manager_id=$2 OR EXISTS(SELECT 1 FROM project_members m WHERE m.project_id=p.id AND m.user_id=$2))`;

export async function notify(
  client: Pool | PoolClient,
  userIds: string[],
  n: {
    project_id: string | null;
    level: "red" | "amber" | "info";
    title: string;
    body?: string;
    key: string;
  },
) {
  const inserted: string[] = [];
  for (const id of new Set(userIds)) {
    const r = await client.query(
      "INSERT INTO notifications(user_id,project_id,level,title,body,dedupe_key) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(user_id,dedupe_key) DO NOTHING RETURNING id",
      [id, n.project_id, n.level, n.title, n.body || "", n.key],
    );
    if (r.rowCount) inserted.push(id);
  }
  return inserted;
}
