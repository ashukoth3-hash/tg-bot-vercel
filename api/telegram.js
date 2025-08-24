import { Telegraf, Markup } from 'telegraf';
import { kv } from '@vercel/kv';

const token = process.env.BOT_TOKEN;
if (!token) throw new Error('BOT_TOKEN missing');

const bot = new Telegraf(token, { handlerTimeout: 9000 });

/** ====== CONFIG / ENV ====== */
const ADMIN_ID = process.env.ADMIN_ID ? Number(process.env.ADMIN_ID) : null;

// Multi-channel force-join: read from FORCE_JOIN_CHANNELS (comma/space separated) or single FORCE_JOIN_CHANNEL
const FORCE_JOIN_CHANNELS = (
  process.env.FORCE_JOIN_CHANNELS || process.env.FORCE_JOIN_CHANNEL || ''
)
  .split(/[,\s]+/)
  .filter(Boolean)
  .map(s => s.replace(/^https?:\/\/t\.me\//, '@'));

const BONUS_JOIN     = Number(process.env.JOIN_BONUS ?? 0);
const BONUS_REFERRER = Number(process.env.REFERRAL_BONUS_REFERRER ?? 50);
const BONUS_NEW      = Number(process.env.REFERRAL_BONUS_NEW ?? 25);
const BONUS_DAILY    = Number(process.env.DAILY_BONUS ?? 10);
const MIN_WITHDRAW   = Number(process.env.MIN_WITHDRAW ?? 500);

// Optional 1 simple task via env
const TASKS = [
  process.env.TASK1_URL ? { id: 'task1', url: process.env.TASK1_URL, reward: Number(process.env.TASK1_REWARD ?? 15) } : null,
].filter(Boolean);

// Cache bot username (for referral link)
let CACHED_BOT_USERNAME = process.env.BOT_USERNAME || null;
async function getBotUsername(ctx) {
  if (CACHED_BOT_USERNAME) return CACHED_BOT_USERNAME;
  try {
    const me = await ctx.telegram.getMe();
    CACHED_BOT_USERNAME = me?.username || null;
  } catch {}
  return CACHED_BOT_USERNAME;
}

/** ====== KV keys ====== */
const kUser  = (uid) => `u:${uid}`;     // hash: {coins, joinedAt, refBy, lastDaily, firstStartDone}
const kRef   = (uid) => `ref:${uid}`;   // set of referred ids
const kTask  = (uid) => `task:${uid}`;  // set of completed task ids
const kWQ    = ()    => `withdraw:q`;   // list of JSON

/** ====== KV helpers ====== */
async function getUser(uid) {
  const data = await kv.hgetall(kUser(uid));
  if (!data) return null;
  const out = { ...data };
  ['coins','joinedAt','lastDaily'].forEach((f) => {
    if (out[f] !== undefined) out[f] = Number(out[f]);
  });
  return out;
}
async function ensureUser(uid) {
  const ex = await kv.exists(kUser(uid));
  if (!ex) await kv.hset(kUser(uid), { coins: 0, joinedAt: Date.now() });
}
async function addCoins(uid, amt) {
  return kv.hincrby(kUser(uid), 'coins', amt);
}

/** ====== Force-join check (multi-channel) ====== */
async function forceJoinCheck(ctx) {
  if (!FORCE_JOIN_CHANNELS.length) return true;

  const requiredList = FORCE_JOIN_CHANNELS.map(c => c.replace(/^@/, ''));
  try {
    for (const handle of requiredList) {
      const m = await ctx.telegram.getChatMember(`@${handle}`, ctx.from.id);
      const st = m?.status;
      if (!st || st === 'left' || st === 'kicked') {
        const text =
          '👋 पहले इन channels को join करो:\n' +
          requiredList.map(h => `• https://t.me/${h}`).join('\n') +
          '\n\nJoin करने के बाद /start दुबारा भेजो.';
        const buttons = requiredList.map(h => [Markup.button.url(`Join ${h}`, `https://t.me/${h}`)]);
        await ctx.reply(text, { disable_web_page_preview: true, ...Markup.inlineKeyboard(buttons) });
        return false;
      }
    }
  } catch (e) {
    const buttons = requiredList.map(h => [Markup.button.url(`Join ${h}`, `https://t.me/${h}`)]);
    await ctx.reply(
      'ℹ️ Join check नहीं हो पाया. इन links से join करो और /start फिर से भेजो.',
      { disable_web_page_preview: true, ...Markup.inlineKeyboard(buttons) }
    );
    return false;
  }
  return true;
}

/** ====== UI ====== */
function sendMenu(ctx, text = 'Menu:') {
  const rows = [
    [Markup.button.callback('💰 Balance', 'bal'), Markup.button.callback('🎁 Daily Bonus', 'daily')],
    [Markup.button.callback('👥 Referral', 'refer'), Markup.button.callback('🧩 Tasks', 'tasks')],
    [Markup.button.callback('💸 Withdraw', 'wd')],
  ];
  if (FORCE_JOIN_CHANNELS.length) {
    for (const c of FORCE_JOIN_CHANNELS) {
      const h = c.replace(/^@/,'');
      rows.push([Markup.button.url(`✅ Join ${h}`, `https://t.me/${h}`)]);
    }
  }
  return ctx.reply(text, Markup.inlineKeyboard(rows));
}

/** ====== START + REFERRAL ====== */
bot.start(async (ctx) => {
  const ok = await forceJoinCheck(ctx);
  if (!ok) return;

  await ensureUser(ctx.from.id);

  // start payload as referrer user id (digits only)
  const payload = ctx.startPayload;
  const refId = payload && /^\d+$/.test(payload) ? Number(payload) : null;

  const u = await getUser(ctx.from.id);
  if (!u?.firstStartDone) {
    const updates = { firstStartDone: '1' };
    if (refId && refId !== ctx.from.id) {
      updates.refBy = String(refId);
      await addCoins(ctx.from.id, BONUS_NEW);
      await addCoins(refId, BONUS_REFERRER);
      await kv.sadd(kRef(refId), String(ctx.from.id));
    }
    if (BONUS_JOIN > 0) await addCoins(ctx.from.id, BONUS_JOIN);
    await kv.hset(kUser(ctx.from.id), updates);
  }

  await ctx.reply(`Welcome ${ctx.from.first_name || 'buddy'} 🇮🇳👋\nYe bot webhook par 24/7 online hai.`);
  return sendMenu(ctx);
});

/** ====== MENU ACTIONS ====== */
bot.action('bal', async (ctx) => {
  await ctx.answerCbQuery();
  await ensureUser(ctx.from.id);
  const u = await getUser(ctx.from.id);
  return ctx.reply(`💰 Balance: *${u?.coins ?? 0}* coins`, { parse_mode: 'Markdown' });
});

bot.action('daily', async (ctx) => {
  await ctx.answerCbQuery();
  await ensureUser(ctx.from.id);
  const u = await getUser(ctx.from.id);
  const now = Date.now();
  const next = (u?.lastDaily ?? 0) + 24*60*60*1000;
  if (now < next) {
    const left = Math.ceil((next - now) / 3600000);
    return ctx.reply(`⏳ Daily bonus already claimed. Try after ~${left}h.`);
  }
  const bal = await addCoins(ctx.from.id, BONUS_DAILY);
  await kv.hset(kUser(ctx.from.id), { lastDaily: now });
  return ctx.reply(`🎁 Daily bonus +${BONUS_DAILY}. New balance: ${bal}`);
});

bot.action('refer', async (ctx) => {
  await ctx.answerCbQuery();
  const me = ctx.from.id;
  const botUser = (await getBotUsername(ctx)) || 'your_bot_username';
  const link = `https://t.me/${botUser}?start=${me}`;
  const cnt = await kv.scard(kRef(me));
  const text = [
    `👥 *Referral Program*`,
    `• Your link: ${link}`,
    `• You get: +${BONUS_REFERRER} coins/friend`,
    `• New user gets: +${BONUS_NEW} coins`,
    `• Joined by you: ${cnt} friends`,
  ].join('\n');
  return ctx.reply(text, { parse_mode: 'Markdown', disable_web_page_preview: true });
});

bot.action('tasks', async (ctx) => {
  await ctx.answerCbQuery();
  if (!TASKS.length) return ctx.reply('🧩 No tasks right now.');
  const rows = TASKS.map(t => [
    Markup.button.url('🔗 Open', t.url),
    Markup.button.callback(`✅ Claim +${t.reward}`, `claim:${t.id}`)
  ]);
  return ctx.reply('🧩 Tasks:', Markup.inlineKeyboard(rows));
});

bot.action(/claim:(.+)/, async (ctx) => {
  await ctx.answerCbQuery();
  const id = ctx.match[1];
  const key = kTask(ctx.from.id);
  const already = await kv.sismember(key, id);
  if (already) return ctx.reply('✅ Already claimed.');
  const task = TASKS.find(t => t.id === id);
  if (!task) return ctx.reply('Task not found.');
  await kv.sadd(key, id);
  const bal = await addCoins(ctx.from.id, task.reward);
  return ctx.reply(`🎉 Task complete! +${task.reward}. Balance: ${bal}`);
});

/** ====== WITHDRAW ====== */
bot.action('wd', async (ctx) => {
  await ctx.answerCbQuery();
  await ensureUser(ctx.from.id);
  const u = await getUser(ctx.from.id);
  if ((u?.coins ?? 0) < MIN_WITHDRAW) {
    return ctx.reply(`❗ Minimum withdraw ${MIN_WITHDRAW} coins. Your balance: ${u?.coins ?? 0}`);
  }
  return ctx.reply(
    '💸 Send your UPI/details like:\n`/withdraw upi_id amount`\nExample: `/withdraw gpay@okicici 500`',
    { parse_mode: 'Markdown' }
  );
});

bot.hears(/^\/withdraw\s+(\S+)\s+(\d+)/i, async (ctx) => {
  const upi = ctx.match[1];
  const amt = Number(ctx.match[2]);
  const u = await getUser(ctx.from.id);
  if (!u || (u.coins ?? 0) < amt) return ctx.reply('❌ Not enough balance.');
  const req = { uid: ctx.from.id, name: ctx.from.first_name, upi, amt, ts: Date.now() };
  await kv.lpush(kWQ(), JSON.stringify(req));
  if (ADMIN_ID) {
    await ctx.telegram.sendMessage(
      ADMIN_ID,
      `💸 Withdraw request\nUser: ${ctx.from.id} (${ctx.from.first_name})\nUPI: ${upi}\nAmount: ${amt}\nCoins: ${u.coins}`
    );
  }
  return ctx.reply('✅ Withdraw request received. Admin will review soon.');
});

/** ====== BASICS ====== */
bot.command('ping', (ctx) => ctx.reply('🏓 pong'));
bot.command('help', (ctx) =>
  ctx.reply('Commands:\n• /start – start\n• /ping – status\n• /help – help\n• /withdraw <upi> <amount>')
);

/** ====== WEBHOOK HANDLER (Vercel) ====== */
export default async function handler(req, res) {
  if (process.env.WEBHOOK_SECRET) {
    const q = req.query?.secret;
    if (q !== process.env.WEBHOOK_SECRET) {
      res.status(401).json({ ok: false, error: 'bad secret' });
      return;
    }
  }
  if (req.method === 'POST') {
    try {
      await bot.handleUpdate(req.body);
      res.status(200).json({ ok: true });
    } catch (e) {
      console.error('handleUpdate error', e);
      res.status(200).json({ ok: true });
    }
  } else {
    res.status(200).json({ ok: true, hello: 'telegram' });
  }
}
