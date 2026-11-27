import {
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import type { Pool } from "pg";
import { checkOrigin, currentUser } from "./access.js";
import { notify } from "./db.js";
import { projectHealth, todayIso } from "./insights.js";

const LOCK = 736492020;

/** Monday of the current week, so each warning repeats at most weekly. */
function weekKey(today: string) {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

async function postTeams(lines: string[]) {
  const url = process.env.TEAMS_WEBHOOK_URL;
  if (!url || !lines.length) return false;
  try {
    // Adaptive Card payload accepted by Teams Workflows incoming webhooks.
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({
        type: "message",
        attachments: [
          {
            contentType: "application/vnd.microsoft.card.adaptive",
            content: {
              $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
              type: "AdaptiveCard",
              version: "1.4",
              body: [
                { type: "TextBlock", size: "Medium", weight: "Bolder", text: "Shockwave PMO · Peringatan merah" },
                ...lines.slice(0, 25).map((text) => ({ type: "TextBlock", wrap: true, text })),
              ],
            },
          },
        ],
      }),
    });
    if (!response.ok) console.warn(`Teams webhook ditolak: HTTP ${response.status}`);
    return response.ok;
  } catch (error) {
    console.warn(`Teams webhook gagal: ${(error as Error).message}`);
    return false;
  }
}

export async function runEarlyWarning(db: Pool) {
  const client = await db.connect();
  try {
    const locked = (
      await client.query("SELECT pg_try_advisory_lock($1) AS ok", [LOCK])
    ).rows[0].ok;
    if (!locked) return { skipped: true, notifications: 0, teams: false };
    try {
      const today = todayIso(),
        week = weekKey(today);
      const ids = (
        await client.query(
          "SELECT id FROM projects WHERE archived_at IS NULL AND closed_at IS NULL AND status<>'completed'",
        )
      ).rows.map((r) => String(r.id));
      const health = await projectHealth(client, ids, today);
      const members = (
        await client.query(
          "SELECT m.project_id,m.user_id FROM project_members m JOIN users u ON u.id=m.user_id WHERE u.active AND m.project_id=ANY($1::uuid[])",
          [ids],
        )
      ).rows;
      const admins = (
        await client.query("SELECT id FROM users WHERE role='admin' AND active")
      ).rows.map((r) => String(r.id));
      let created = 0;
      const teams: string[] = [];
      for (const p of health)
        for (const w of p.warnings) {
          const recipients =
            w.level === "red"
              ? [
                  p.manager_id,
                  ...members.filter((m) => m.project_id === p.id).map((m) => String(m.user_id)),
                  ...admins,
                ]
              : [p.manager_id];
          const inserted = await notify(client, recipients, {
            project_id: p.id,
            level: w.level,
            title: `${p.code} · ${w.message}`,
            body: `${p.name} · PM ${p.manager_name}`,
            key: `warn:${p.id}:${w.code}:${week}`,
          });
          created += inserted.length;
          if (w.level === "red" && inserted.length)
            teams.push(`**${p.code} ${p.name}** — ${w.message}`);
        }
      return { skipped: false, notifications: created, teams: await postTeams(teams) };
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [LOCK]);
    }
  } finally {
    client.release();
  }
}

export function startEarlyWarning(db: Pool) {
  const minutes = Number(process.env.EARLY_WARNING_INTERVAL_MINUTES || 60);
  if (!minutes || minutes < 0) return () => {};
  const run = () =>
    runEarlyWarning(db).catch((e) =>
      console.error(`Early warning gagal: ${(e as Error).message}`),
    );
  const first = setTimeout(run, 30000);
  const timer = setInterval(run, Math.max(5, minutes) * 60000);
  first.unref();
  timer.unref();
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}

@Controller("api")
export class NotificationsController {
  constructor(@Inject("DB") private readonly db: Pool) {}

  @Get("notifications") async list(@Req() req: Request, @Query("unread") unread?: string) {
    const user = await currentUser(this.db, req);
    const [rows, count] = await Promise.all([
      this.db.query(
        `SELECT n.*,p.code AS project_code FROM notifications n LEFT JOIN projects p ON p.id=n.project_id
         WHERE n.user_id=$1 ${unread === "1" ? "AND n.read_at IS NULL" : ""} ORDER BY n.created_at DESC LIMIT 60`,
        [user.id],
      ),
      this.db.query(
        "SELECT count(*)::int AS unread FROM notifications WHERE user_id=$1 AND read_at IS NULL",
        [user.id],
      ),
    ]);
    return { notifications: rows.rows, unread: count.rows[0].unread };
  }

  @Post("notifications/read-all") @HttpCode(200) async readAll(@Req() req: Request) {
    checkOrigin(req);
    const user = await currentUser(this.db, req);
    await this.db.query(
      "UPDATE notifications SET read_at=now() WHERE user_id=$1 AND read_at IS NULL",
      [user.id],
    );
    return { success: true };
  }

  @Post("notifications/:id/read") @HttpCode(200) async read(
    @Req() req: Request,
    @Param("id") id: string,
  ) {
    checkOrigin(req);
    const user = await currentUser(this.db, req);
    await this.db.query(
      "UPDATE notifications SET read_at=coalesce(read_at,now()) WHERE id=$1 AND user_id=$2",
      [Number(id) || 0, user.id],
    );
    return { success: true };
  }

  @Post("admin/early-warning/run") @HttpCode(200) async runNow(@Req() req: Request) {
    checkOrigin(req);
    const user = await currentUser(this.db, req);
    if (user.role !== "admin") throw new ForbiddenException("Khusus administrator.");
    return runEarlyWarning(this.db);
  }
}
