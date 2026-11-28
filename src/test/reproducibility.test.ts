// @vitest-environment node
// Isolated PostgreSQL replay, not a reset of a Supabase service or the live DB.
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const db = new PGlite();
const seed = readFileSync("supabase/seed.sql", "utf8");
const owner = "00000000-0000-4000-8000-00000000d001";

beforeAll(async () => {
  // Only the minimal Supabase role/auth contract is stubbed in this fixture DB.
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;`);
  for (const file of readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  }
  await db.exec(seed);
}, 60_000);
afterAll(async () => { await db.close(); });

describe("fresh database packaging", () => {
  it("creates all ten used tables with owner RLS and authenticated CRUD grants", async () => {
    const rows = await db.query<{ relname: string; relrowsecurity: boolean; crud: boolean }>(`
      SELECT c.relname, c.relrowsecurity,
        has_table_privilege('authenticated', c.oid, 'SELECT') AND
        has_table_privilege('authenticated', c.oid, 'INSERT') AND
        has_table_privilege('authenticated', c.oid, 'UPDATE') AND
        has_table_privilege('authenticated', c.oid, 'DELETE') AS crud
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname`);
    expect(rows.rows.map((r) => r.relname)).toEqual([
      "activity_log", "assignments", "calibration_multipliers", "courses", "detected_items",
      "estimate_events", "lms_connections", "steps", "users_settings", "weekly_allocations",
    ]);
    expect(rows.rows.filter((r) => !r.relrowsecurity || !r.crud)).toEqual([]);
  });

  it("replays missing live columns and enforces assignment uniqueness", async () => {
    const rows = await db.query<{ column_name: string }>(`
      SELECT column_name FROM information_schema.columns WHERE table_name='estimate_events'
        AND column_name IN ('calibration_used','excluded_reason','ai_refined') ORDER BY column_name`);
    expect(rows.rows.map((r) => r.column_name)).toEqual(["ai_refined", "calibration_used", "excluded_reason"]);
    await expect(db.exec(`INSERT INTO public.assignments (user_id,lms_assignment_id,title)
      VALUES ('${owner}', 'demo-hash', 'Duplicate fixture')`)).rejects.toThrow();
  });

  it("rejects a step status outside todo, done, blocked, stopped", async () => {
    await expect(db.exec(`INSERT INTO public.steps (assignment_id,order_index,title,status)
      VALUES ('00000000-0000-4000-8000-00000000a001',99,'Bad status fixture','invalid')`)).rejects.toThrow();
  });

  it("seeds four courses and exactly eleven assignments with the requested mix", async () => {
    const courses = await db.query<{ count: number }>("SELECT count(*)::int AS count FROM public.courses");
    expect(courses.rows[0]?.count).toBe(4);
    const mix = await db.query<{ item_type: string; count: number }>(
      "SELECT item_type,count(*)::int AS count FROM public.detected_items GROUP BY item_type ORDER BY item_type");
    expect(mix.rows).toEqual([
      { item_type: "paper", count: 4 }, { item_type: "post", count: 1 },
      { item_type: "quiz", count: 2 }, { item_type: "read", count: 2 }, { item_type: "video", count: 2 },
    ]);
  });

  it("seeds exactly one urgent red item, one amber and nine green", async () => {
    const rows = await db.query<{ buffer_state: string; count: number }>(
      "SELECT buffer_state,count(*)::int AS count FROM public.assignments GROUP BY buffer_state ORDER BY buffer_state");
    expect(rows.rows).toEqual([
      { buffer_state: "amber", count: 1 }, { buffer_state: "green", count: 9 }, { buffer_state: "red", count: 1 },
    ]);
    const urgent = await db.query<{ count: number; effort: number }>(`
      SELECT count(*)::int AS count, max(estimated_minutes)::int AS effort FROM public.assignments
      WHERE due_at BETWEEN now() AND now() + interval '12 hours'`);
    expect(urgent.rows[0]).toEqual({ count: 1, effort: 360 });
  });

  it("has steps for every assignment and three samples per calibration type", async () => {
    const rows = await db.query<{ count: number }>(`SELECT count(*)::int AS count FROM public.assignments a
      WHERE NOT EXISTS (SELECT 1 FROM public.steps s WHERE s.assignment_id=a.id)`);
    expect(rows.rows[0]?.count).toBe(0);
    const samples = await db.query<{ item_type: string; count: number }>(`SELECT item_type,count(*)::int AS count
      FROM public.estimate_events WHERE actual_minutes IS NOT NULL GROUP BY item_type ORDER BY item_type`);
    expect(samples.rows).toEqual([{ item_type: "reading", count: 3 }, { item_type: "writing", count: 3 }]);
  });

  it("keeps row counts unchanged when the seed runs a second time", async () => {
    await db.exec(seed);
    const rows = await db.query<{ assignments: number; steps: number; events: number }>(`SELECT
      (SELECT count(*)::int FROM public.assignments) AS assignments,
      (SELECT count(*)::int FROM public.steps) AS steps,
      (SELECT count(*)::int FROM public.estimate_events) AS events`);
    expect(rows.rows[0]).toEqual({ assignments: 11, steps: 31, events: 6 });
  });

  it("allows fixture owner reads and blocks a different authenticated user", async () => {
    await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${owner}',false);`);
    try {
      const rows = await db.query<{ count: number }>("SELECT count(*)::int AS count FROM public.steps");
      expect(rows.rows[0]?.count).toBe(31);
      await db.exec("SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000d002',false);");
      const other = await db.query<{ count: number }>("SELECT count(*)::int AS count FROM public.steps");
      expect(other.rows[0]?.count).toBe(0);
    } finally { await db.exec("RESET ROLE;"); }
  });
});