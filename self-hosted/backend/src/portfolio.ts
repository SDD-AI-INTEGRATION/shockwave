import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Param,
  Patch,
  Query,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import type { Pool } from "pg";
import { z } from "zod";
import { checkOrigin, currentUser, validId } from "./access.js";
import { audit, parse, visibleProjects } from "./db.js";
import { projectHealth, workload } from "./insights.js";
import type { User } from "./security.js";

export async function visibleProjectIds(db: Pool, user: User) {
  return (
    await db.query(
      `SELECT p.id FROM projects p WHERE ${visibleProjects} ORDER BY p.created_at DESC`,
      [user.role, user.id],
    )
  ).rows.map((r) => String(r.id));
}

@Controller("api")
export class PortfolioController {
  constructor(@Inject("DB") private readonly db: Pool) {}

  @Get("portfolio/health") async health(@Req() req: Request) {
    const user = await currentUser(this.db, req);
    const projects = await projectHealth(this.db, await visibleProjectIds(this.db, user));
    const order = { red: 0, amber: 1, green: 2 };
    projects.sort((a, b) => order[a.rag] - order[b.rag] || a.code.localeCompare(b.code));
    const sum = (f: (p: (typeof projects)[number]) => number) =>
      projects.reduce((s, p) => s + f(p), 0);
    return {
      projects,
      summary: {
        total: projects.length,
        red: projects.filter((p) => p.rag === "red").length,
        amber: projects.filter((p) => p.rag === "amber").length,
        green: projects.filter((p) => p.rag === "green").length,
        late: projects.filter((p) => p.days_late > 0).length,
        contract_value: sum((p) => p.finance.contract_value),
        billed: sum((p) => p.finance.billed),
        paid: sum((p) => p.finance.paid),
        outstanding: sum((p) => p.finance.outstanding),
        high_risks: sum((p) => p.risks.high),
        overdue_actions: sum((p) => p.actions.overdue),
        documents_review: sum((p) => p.documents.needs_review),
      },
    };
  }

  @Get("resources/workload") async workload(
    @Req() req: Request,
    @Query("months") months = "6",
  ) {
    const user = await currentUser(this.db, req);
    const n = Math.min(12, Math.max(1, Number(months) || 6));
    return {
      scope: user.role === "admin" ? "all" : "self",
      people: await workload(this.db, user.role === "admin" ? null : [user.id], n),
    };
  }

  @Patch("admin/users/:id/capacity") async capacity(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    checkOrigin(req);
    const user = await currentUser(this.db, req);
    if (user.role !== "admin") throw new ForbiddenException("Khusus administrator.");
    const input = parse(z.object({ capacity: z.number().int().min(1).max(50) }), body);
    await this.db.query("UPDATE users SET capacity=$1 WHERE id=$2", [input.capacity, validId(id)]);
    await audit(this.db, user, "user.capacity_updated", id);
    return { success: true };
  }
}
