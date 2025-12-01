export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };

    if (request.method === "OPTIONS")
      return new Response("", { status: 204, headers: cors });

    const json = (obj, status = 200) =>
      new Response(JSON.stringify(obj), {
        status,
        headers: { "Content-Type": "application/json", ...cors }
      });

    // ------------------------------------------------
    // LIST FILES
    // ------------------------------------------------
    if (path === "/api/list") {
      const user = url.searchParams.get("user");
      const list = await env.FILES.list({ prefix: user + "/" });
      return json({ files: list.keys.map(k => k.name.replace(user + "/", "")) });
    }

    // ------------------------------------------------
    // LOAD FILE
    // ------------------------------------------------
    if (path === "/api/load") {
      const user = url.searchParams.get("user");
      const filename = url.searchParams.get("filename");
      const text = await env.FILES.get(`${user}/${filename}`, "text");
      return new Response(text || "", { headers: cors });
    }

    // ------------------------------------------------
    // SAVE FILE
    // ------------------------------------------------
    if (path === "/api/save") {
      const { user, filename, content } = await request.json();
      await env.FILES.put(`${user}/${filename}`, content);
      return json({ success: true });
    }

    // ------------------------------------------------
    // ADD DEPLOY REQUEST
    // ------------------------------------------------
    if (path === "/api/add-deploy") {
      const { user } = await request.json();
      await env.FILES.put(`deploy-queue/${user}`, Date.now().toString());
      return json({ queued: true });
    }

    // ------------------------------------------------
    // BOT PULL DEPLOY REQUEST
    // ------------------------------------------------
    if (path === "/api/pull-deploy") {
      const botToken = url.searchParams.get("bot_token");
      if (botToken !== env.BOT_TOKEN) return json({ error: "Invalid bot token" }, 403);

      const list = await env.FILES.list({ prefix: "deploy-queue/" });
      if (!list.keys.length) return json({ user: null });

      const key = list.keys[0].name;
      const user = key.replace("deploy-queue/", "");

      await env.FILES.delete(key);

      return json({ user });
    }

    // ------------------------------------------------
    // BOT LOAD ALL FILES
    // ------------------------------------------------
    if (path === "/api/load-user-files") {
      const user = url.searchParams.get("user");
      const list = await env.FILES.list({ prefix: user + "/" });

      let files = {};
      for (const f of list.keys) {
        const name = f.name.replace(user + "/", "");
        const content = await env.FILES.get(f.name, "text");
        files[name] = content;
      }

      return json({ files });
    }

    return new Response("Worker OK", { headers: cors });
  }
};
