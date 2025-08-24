import { Telegraf, Markup } from 'telegraf';

const token = process.env.BOT_TOKEN;
if (!token) throw new Error('BOT_TOKEN missing');

const bot = new Telegraf(token, { handlerTimeout: 9000 });

bot.start(async (ctx) => {
  const ch = process.env.FORCE_JOIN_CHANNEL; // e.g. @loot4udeal
  if (ch) {
    try {
      const channel = ch.replace(/^@/, '');
      const m = await ctx.telegram.getChatMember(`@${channel}`, ctx.from.id);
      const status = m?.status;
      if (!status || status === 'left' || status === 'kicked') {
        await ctx.reply(
          `👋 पहले इस channel को join करो:\nhttps://t.me/${channel}\n\nJoin के बाद /start दुबारा भेजो.`,
          { disable_web_page_preview: true }
        );
        return;
      }
    } catch (e) {
      await ctx.reply(
        `ℹ️ Join check नहीं हो पाया. यहाँ join करो और /start दुबारा भेजो:\nhttps://t.me/${ch.replace(/^@/,'')}`,
        { disable_web_page_preview: true }
      );
      return;
    }
  }

  await ctx.reply(
    `Welcome ${ctx.from.first_name || 'buddy'} 👋\nYe bot webhook par 24/7 online hai.`,
    Markup.inlineKeyboard([
      [Markup.button.callback('📜 Menu', 'menu')],
      ...(process.env.FORCE_JOIN_CHANNEL ? [[
        Markup.button.url('✅ Join Channel', `https://t.me/${process.env.FORCE_JOIN_CHANNEL.replace(/^@/,'')}`)
      ]] : [])
    ])
  );
});

bot.action('menu', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    'Menu:\n• /start – start\n• /ping – status',
    Markup.inlineKeyboard([[Markup.button.callback('🔄 Refresh', 'menu')]])
  );
});

bot.command('ping', (ctx) => ctx.reply('🏓 pong'));

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
