export default async function handler(req, res) {
  res.status(200).json({
    BOT_TOKEN: !!process.env.BOT_TOKEN,
    APP_URL: !!process.env.APP_URL,
    WEBHOOK_SECRET: !!process.env.WEBHOOK_SECRET,
    app_url_value: process.env.APP_URL || null,
    note: "true = present, false = missing"
  });
}
