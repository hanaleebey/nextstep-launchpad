// Invoked inside the sanitized snapshot. No external service credentials needed.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { assertSeedCounts, fixtureOwner, localStatus, seedCounts } from './local-setup-contract.mjs';

const [project, apiUrl] = process.argv.slice(2);
assert.match(project ?? '', /^nextstep-check-[a-f0-9]{8}$/);
const { url, key } = localStatus({ API_URL: apiUrl, ANON_KEY: process.env.NEXTSTEP_LOCAL_ANON_KEY });
const sql = (text) => execFileSync('docker', ['exec', '-i', `supabase_db_${project}`,
  'psql', '-U', 'postgres', '-d', 'postgres', '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1'],
  { input: text, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const query = (text) => JSON.parse(sql(text));
const counts = () => Object.fromEntries(Object.keys(seedCounts).map((table) =>
  [table, Number(sql(`SELECT count(*) FROM public.${table};`))]));
assertSeedCounts(counts());
const versions = query('SELECT coalesce(json_agg(version ORDER BY version),\'[]\') FROM supabase_migrations.schema_migrations;');
assert.deepEqual(versions, readdirSync('supabase/migrations').filter((p) => p.endsWith('.sql')).sort().map((p) => p.split('_')[0]));
assert.equal(Number(sql(`SELECT count(*) FROM pg_tables WHERE schemaname='public' AND rowsecurity;`)), 10);
assert.equal(Number(sql(`SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'
  AND has_table_privilege('authenticated', 'public.' || table_name, 'SELECT')
  AND has_table_privilege('authenticated', 'public.' || table_name, 'INSERT')
  AND has_table_privilege('authenticated', 'public.' || table_name, 'UPDATE')
  AND has_table_privilege('authenticated', 'public.' || table_name, 'DELETE');`)), 10);
assert.deepEqual(query(`SELECT json_object_agg(item_type,n) FROM
  (SELECT item_type,count(*) n FROM public.detected_items GROUP BY item_type) s;`),
  { video: 2, read: 2, quiz: 2, paper: 4, post: 1 });
assert.deepEqual(query(`SELECT json_object_agg(item_type,n) FROM
  (SELECT item_type,count(*) n FROM public.estimate_events WHERE actual_minutes IS NOT NULL GROUP BY item_type) s;`),
  { reading: 3, writing: 3 });
assert.deepEqual(query(`SELECT json_object_agg(buffer_state,n) FROM
  (SELECT buffer_state,count(*) n FROM public.assignments GROUP BY buffer_state) s;`), { red: 1, amber: 1, green: 9 });
assert.equal(Number(sql(`SELECT count(*) FROM public.assignments a WHERE NOT EXISTS
  (SELECT 1 FROM public.steps s WHERE s.assignment_id=a.id);`)), 0);
assert.equal(Number(sql(`SELECT count(*) FROM public.assignments WHERE due_at BETWEEN now() AND now()+interval '12 hours' AND estimated_minutes=360;`)), 1);
// Exercise actual PostgreSQL auth.uid(), not a PGlite stub, then restore role.
assert.ok(sql(`BEGIN; SET LOCAL ROLE authenticated;
  SELECT set_config('request.jwt.claim.sub','${fixtureOwner}',true);
  SELECT count(*) FROM public.steps; ROLLBACK;`).split('\n').includes('31'));
// A repeat seed must preserve both row counts and existing progress.
sql(`UPDATE public.steps SET status='stopped' WHERE id='00000000-0000-4000-8000-00000000b005';`);
sql(readFileSync('supabase/seed.sql', 'utf8'));
assertSeedCounts(counts());
assert.equal(sql(`SELECT status FROM public.steps WHERE id='00000000-0000-4000-8000-00000000b005';`), 'stopped');

const client = () => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const owner = client();
const other = client();
for (const user of [owner, other]) {
  const signup = await user.auth.signUp({ email: `local-${randomUUID()}@nextstep.example`, password: randomUUID() + 'aA1!' });
  assert.equal(signup.error, null);
  assert.ok(signup.data.session, 'Local Auth must permit confirmed test sessions');
  const hidden = await user.from('assignments').select('id');
  assert.equal(hidden.error, null);
  assert.deepEqual(hidden.data, [], 'Seed must not leak to new accounts');
}
const session = await owner.auth.getUser();
const userId = session.data.user?.id;
assert.ok(userId);
// Same public API/RLS path as the application, with real local Auth sessions.
const assignment = await owner.from('assignments').insert({ user_id: userId, title: 'Local persisted completion check' }).select('id').single();
assert.equal(assignment.error, null);
assert.ok(assignment.data);
const hiddenAssignment = await other.from('assignments').select('id').eq('id', assignment.data.id);
assert.equal(hiddenAssignment.error, null);
assert.deepEqual(hiddenAssignment.data, []);
const step = await owner.from('steps').insert({ assignment_id: assignment.data.id, order_index: 0, title: 'Verify persisted completion', timebox_minutes: 4, done_criteria: ['Result reads back'] }).select('id').single();
assert.equal(step.error, null);
assert.ok(step.data);
const denied = await other.from('steps').select('id').eq('id', step.data.id);
assert.equal(denied.error, null);
assert.deepEqual(denied.data, []);
const complete = await owner.rpc('complete_step', { _step_id: step.data.id, _status: 'done' });
assert.equal(complete.error, null);
const readback = await owner.from('assignments').select('status,progress_pct').eq('id', assignment.data.id).single();
assert.equal(readback.error, null);
assert.deepEqual(readback.data, { status: 'done', progress_pct: 100 });
// Only malformed/anonymous requests: no Moodle, YouTube or model calls.
for (const name of ['agent-estimate', 'moodle-connect', 'moodle-sync']) {
  const response = await fetch(`${url}/functions/v1/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(response.status, 401);
}
await owner.auth.signOut();
await other.auth.signOut();