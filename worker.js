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

    // LIST
    if (path === "/api/list") {
      const user = url.searchParams.get("user");
      if (!user) return json({ error: "Missing user" });

      const list = await env.FILES.list({ prefix: `${user}/` });
      return json({ files: list.keys.map(k => k.name.replace(`${user}/`, "")) });
    }

    // LOAD
    if (path === "/api/load") {
      const user = url.searchParams.get("user");
      const filename = url.searchParams.get("filename");

      if (!user || !filename) return json({ error: "Missing params" });

      const text = await env.FILES.get(`${user}/${filename}`, "text");
      return new Response(text || "", {
        headers: { "Content-Type": "text/plain", ...cors }
      });
    }

    // SAVE
    if (path === "/api/save") {
      let body;
      try { body = await request.json(); }
      catch { return json({ error: "Invalid JSON" }); }

      const { user, filename, content } = body;
      if (!user || !filename) return json({ error: "Missing params" });

      await env.FILES.put(`${user}/${filename}`, content ?? "");
      return json({ success: true });
    }

    // DEPLOY (NEW)
    if (path === "/api/deploy") {
      let body;
      try { body = await request.json(); }
      catch { return json({ error: "Invalid JSON" }); }

      const { user, filename, code } = body;
      if (!user || !filename || !code) return json({ error: "Missing params" });

      // Save public copy in KV
      await env.FILES.put(`public/${user}/${filename}`, code);

      // GitHub Token
      const token = await env.FILES.get("GITHUB_TOKEN", "text");
      if (!token) return json({ error: "GitHub token missing" });

      const githubUrl =
        `https://api.github.com/repos/samadgod569/Code-Mon-space/contents/public/${user}/${filename}`;

      // Check SHA
      let sha = null;
      try {
        const exists = await fetch(githubUrl, {
          headers: { "Authorization": `Bearer ${token}` }
        });
        if (exists.ok) sha = (await exists.json()).sha;
      } catch {}

      const ghRes = await fetch(githubUrl, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message: `Deploy ${user}/${filename}`,
          content: btoa(code),
          branch: "main",
          ...(sha ? { sha } : {})
        })
      });

      const data = await ghRes.json();
      if (!ghRes.ok) return json({ error: "GitHub error", details: data });

      return json({
        success: true,
        url: `https://code-mon.codemon.workers.dev/public/${user}/${filename}`,
        github: data.content?.html_url ?? null
      });
    }

    return new Response("Worker Online", { headers: cors });
  }
};
