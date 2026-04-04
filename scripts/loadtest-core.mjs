#!/usr/bin/env node
import process from 'node:process';
import { performance } from 'node:perf_hooks';
import { createClient } from '@supabase/supabase-js';

function parseArgs(argv) {
  const result = {};
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const [rawKey, rawValue] = arg.slice(2).split('=');
    if (rawValue !== undefined) {
      result[rawKey] = rawValue;
      continue;
    }
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      result[rawKey] = next;
      i += 1;
    } else {
      result[rawKey] = 'true';
    }
  }
  return result;
}

function percentile(sortedValues, p) {
  if (!sortedValues.length) return 0;
  const index = Math.min(sortedValues.length - 1, Math.max(0, Math.ceil((p / 100) * sortedValues.length) - 1));
  return sortedValues[index];
}

function summarizeDurations(name, durationsMs, errors, totalRuntimeMs) {
  const sorted = [...durationsMs].sort((a, b) => a - b);
  const count = sorted.length;
  const throughput = totalRuntimeMs > 0 ? (count / totalRuntimeMs) * 1000 : 0;

  return {
    name,
    requests: count,
    errors,
    throughput_ops_sec: Number(throughput.toFixed(2)),
    p50_ms: Number(percentile(sorted, 50).toFixed(2)),
    p95_ms: Number(percentile(sorted, 95).toFixed(2)),
    p99_ms: Number(percentile(sorted, 99).toFixed(2)),
    max_ms: Number((sorted[sorted.length - 1] || 0).toFixed(2)),
    total_runtime_ms: Number(totalRuntimeMs.toFixed(2)),
  };
}

async function runBenchmark({ name, iterations, concurrency, operation }) {
  const durationsMs = [];
  let errors = 0;
  let cursor = 0;

  const startedAt = performance.now();

  async function worker() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= iterations) break;

      const opStart = performance.now();
      try {
        await operation(index);
      } catch (error) {
        errors += 1;
        const message = error instanceof Error ? error.message : String(error);
        // eslint-disable-next-line no-console
        console.error(`[${name}] request ${index} failed: ${message}`);
      } finally {
        durationsMs.push(performance.now() - opStart);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  const totalRuntimeMs = performance.now() - startedAt;
  return summarizeDurations(name, durationsMs, errors, totalRuntimeMs);
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

function buildDrawingsPayload(iteration, pointsCount = 18) {
  const points = Array.from({ length: pointsCount }, (_, idx) => ({
    x: idx * 8,
    y: ((iteration + idx) % 9) * 5,
  }));
  return [{
    id: `lt-${iteration}-${Date.now()}`,
    type: 'freehand',
    points,
    color: '#111111',
    strokeWidth: 2,
  }];
}

async function main() {
  const args = parseArgs(process.argv);
  const scenario = String(args.scenario || 'all').toLowerCase();
  const iterations = Number(args.iterations || process.env.LOADTEST_ITERATIONS || 120);
  const concurrency = Number(args.concurrency || process.env.LOADTEST_CONCURRENCY || 12);

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Set SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY to run load tests.');
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const summary = [];

  if (scenario === 'all' || scenario === 'open') {
    const userToken = requireEnv('LOADTEST_USER_TOKEN');
    const canvasToken = requireEnv('LOADTEST_CANVAS_TOKEN');
    const pageToken = requireEnv('LOADTEST_PAGE_TOKEN');

    const openResult = await runBenchmark({
      name: 'open_page_rpc',
      iterations,
      concurrency,
      operation: async () => {
        const { data, error } = await supabase.rpc('open_page_api_link', {
          p_user_token: userToken,
          p_canvas_token: canvasToken,
          p_page_token: pageToken,
        });
        if (error) throw error;
        if (!Array.isArray(data) || !data.length) {
          throw new Error('Resolver returned no rows.');
        }
      },
    });

    summary.push(openResult);
  }

  if (scenario === 'all' || scenario === 'draw') {
    if (process.env.LOADTEST_ALLOW_MUTATIONS !== '1') {
      throw new Error('Set LOADTEST_ALLOW_MUTATIONS=1 to run draw/autosave write load tests.');
    }

    const canvasId = requireEnv('LOADTEST_CANVAS_ID');
    const ownerUserId = process.env.LOADTEST_OWNER_USER_ID;

    const drawBurstResult = await runBenchmark({
      name: 'draw_burst_update',
      iterations,
      concurrency,
      operation: async (i) => {
        const payload = {
          drawings: buildDrawingsPayload(i, Number(process.env.LOADTEST_DRAW_POINTS || 22)),
          pan_x: (i % 41) - 20,
          pan_y: (i % 27) - 13,
          zoom: 1,
        };

        let query = supabase.from('canvases').update(payload).eq('id', canvasId);
        if (ownerUserId) query = query.eq('user_id', ownerUserId);
        const { error } = await query;
        if (error) throw error;
      },
    });

    summary.push(drawBurstResult);
  }

  if (scenario === 'all' || scenario === 'autosave') {
    if (process.env.LOADTEST_ALLOW_MUTATIONS !== '1') {
      throw new Error('Set LOADTEST_ALLOW_MUTATIONS=1 to run draw/autosave write load tests.');
    }

    const canvasId = requireEnv('LOADTEST_CANVAS_ID');
    const ownerUserId = process.env.LOADTEST_OWNER_USER_ID;
    const burstSize = Number(process.env.LOADTEST_AUTOSAVE_BURST || 8);

    const autosaveResult = await runBenchmark({
      name: 'autosave_flush_sequence',
      iterations: Math.max(1, Math.floor(iterations / Math.max(1, burstSize))),
      concurrency: Math.max(1, Math.floor(concurrency / 2)),
      operation: async (i) => {
        for (let n = 0; n < burstSize; n += 1) {
          const point = i * burstSize + n;
          const payload = {
            pan_x: (point % 33) - 16,
            pan_y: (point % 19) - 9,
            zoom: 1,
            drawings: buildDrawingsPayload(point, 6),
          };
          let updateQuery = supabase.from('canvases').update(payload).eq('id', canvasId);
          if (ownerUserId) updateQuery = updateQuery.eq('user_id', ownerUserId);
          const { error } = await updateQuery;
          if (error) throw error;
        }

        let readQuery = supabase.from('canvases').select('id,updated_at').eq('id', canvasId).limit(1).single();
        if (ownerUserId) readQuery = readQuery.eq('user_id', ownerUserId);
        const { error } = await readQuery;
        if (error) throw error;
      },
    });

    summary.push(autosaveResult);
  }

  // eslint-disable-next-line no-console
  console.log('\nLoad test summary\n=================');
  summary.forEach((item) => {
    // eslint-disable-next-line no-console
    console.log(`${item.name}:`);
    // eslint-disable-next-line no-console
    console.log(`  requests=${item.requests} errors=${item.errors} throughput=${item.throughput_ops_sec}/s p50=${item.p50_ms}ms p95=${item.p95_ms}ms p99=${item.p99_ms}ms max=${item.max_ms}ms total=${item.total_runtime_ms}ms`);
  });

  const hasErrors = summary.some((item) => item.errors > 0);
  if (hasErrors) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  // eslint-disable-next-line no-console
  console.error(`Load test failed: ${message}`);
  process.exit(1);
});
