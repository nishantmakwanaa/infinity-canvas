import 'dotenv/config';

async function test() {
  const url = process.env.VITE_SUPABASE_URL + '/rest/v1/rpc/upsert_canvas_share';
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': key,
      'Authorization': 'Bearer ' + key
    },
    body: JSON.stringify({
      p_canvas_id: '00000000-0000-0000-0000-000000000000',
      p_access_level: 'viewer'
    })
  });

  console.log('Status:', res.status);
  console.log('Body:', await res.text());
}

test();
