export default async function handler(req, res) {
  const token = process.env.BOT_TOKEN;
  const url = process.env.APP_URL?.replace(/\/$/, '');
  const secret = process.env.WEBHOOK_SECRET;
  if (!token || !url || !secret) {
    res.status(400).json({ ok: false, error: 'Please set BOT_TOKEN, APP_URL, WEBHOOK_SECRET envs' });
    return;
  }
  const webhook = `${url}/api/telegram?secret=${encodeURIComponent(secret)}`;

  try {
    const tg = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        url: webhook,
        drop_pending_updates: false,
        allowed_updates: ['message','callback_query']
      })
    }).then(r => r.json());

    res.status(200).json({ ok: true, telegram: tg, set_to: webhook });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
}
