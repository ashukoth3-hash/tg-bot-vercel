export const config = { runtime: "edge" };

export default async function handler(req) {
  const secret = new URL(req.url).searchParams.get("secret");
  if (secret !== process.env.WEBHOOK_SECRET) {
    return new Response("Forbidden", { status: 403 });
  }

  const update = await req.json().catch(() => ({}));

  // simple /ping reply (testing)
  const msg = update?.message;
  if (msg?.text === "/ping") {
    const text = "🏓 pong";
    await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: msg.chat.id, text })
    });
  }

  return new Response("ok");
}
