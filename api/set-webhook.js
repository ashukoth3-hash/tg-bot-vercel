export const config = { runtime: "edge" };

export default async function handler() {
  const miss = [];
  for (const k of ["BOT_TOKEN","APP_URL","WEBHOOK_SECRET"]) {
    if (!process.env[k]) miss.push(k);
  }
  if (miss.length) {
    return new Response(JSON.stringify({ ok:false, error:`Missing envs: ${miss.join(", ")}` }), { status: 500 });
  }

  const url = `${process.env.APP_URL}/api/telegram?secret=${process.env.WEBHOOK_SECRET}`;

  const resp = await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/setWebhook`,{
    method:"POST",
    headers:{ "content-type":"application/json" },
    body: JSON.stringify({ url })
  });
  const tg = await resp.json();
  return new Response(JSON.stringify({ ok:true, set_to:url, telegram:tg }), { headers:{ "content-type":"application/json"}});
}
