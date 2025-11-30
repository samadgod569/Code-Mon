export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };

    if (request.method === "OPTIONS") {
      return new Response("", { status: 204, headers: corsHeaders });
    }

    const json = (obj, status = 200) =>
      new Response(JSON.stringify(obj), {
        status,
        headers: { "Content-Type": "application/json", ...corsHeaders }
      });

    // ------------------------------
    // LIST FILES
    // ------------------------------
    if (path === "/api/list") {
      const user = url.searchParams.get("user");
      if (!user) return json({ error: "Missing user" }, 400);

      const list = await env.FILES.list({ prefix: `${user}/` });
      return json({
        files: list.keys.map(x => x.name.replace(`${user}/`, ""))
      });
    }

    // ------------------------------
    // LOAD FILE
    // ------------------------------
    if (path === "/api/load") {
      const user = url.searchParams.get("user");
      const filename = url.searchParams.get("filename");

      if (!user || !filename) return json({ error: "Missing params" }, 400);

      const file = await env.FILES.get(`${user}/${filename}`, "text");
      if (!file) return new Response("", { headers: corsHeaders });

      return new Response(file, {
        headers: { "Content-Type": "text/plain", ...corsHeaders }
      });
    }

    // ------------------------------
    // SAVE FILE
    // ------------------------------
    if (path === "/api/save") {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: "Invalid JSON" }, 400);
      }

      const { user, filename, content } = body;
      if (!user || !filename) return json({ error: "Missing params" }, 400);

      await env.FILES.put(`${user}/${filename}`, content ?? "");
      return json({ success: true });
    }

    // ------------------------------
    // DEPLOY
    // ------------------------------
    if (path === "/api/deploy") {
      let body;
      try {
        body = await request.json(); // READ ONLY ONCE
      } catch {
        return json({ error: "Invalid JSON body" }, 400);
      }

      const { user, filename } = body;
      if (!user || !filename) return json({ error: "Missing params" }, 400);

      // Load file safely
      const stored = await env.FILES.get(`${user}/${filename}`, "text");
      if (!stored) return json({ error: "File not found" }, 404);

      // Save deployed version
      await env.FILES.put(`public/${filename}`, stored);

      // ---- GitHub Upload ----
      const githubToken = await env.FILES.get("GITHUB_TOKEN", "text");
      if (!githubToken)
        return json({ error: "GITHUB_TOKEN missing in KV" }, 500);

      const githubApiUrl =
        `https://api.github.com/repos/samadgod569/Code-Mon/contents/public/${filename}`;

      const uploadBody = {
        message: `Deploy ${filename}`,
        content: btoa(stored),
        branch: "main"
      };

      const ghRes = await fetch(githubApiUrl, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${githubToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(uploadBody)
      });

      const text = await ghRes.text();
      let ghJson;
      try {
        ghJson = JSON.parse(text);
      } catch {
        return json({
          error: "GitHub invalid JSON",
          raw: text
        }, 500);
      }

      if (!ghRes.ok) {
        return json({
          error: "GitHub error",
          details: ghJson
        }, 500);
      }

      return json({
        success: true,
        url: `https://code-mon.codemon.workers.dev/public/${filename}`,
        github: ghJson.content?.html_url ?? null
      });
    }

    // ------------------------------
    // DEFAULT
    // ------------------------------
    return new Response("Worker Online", { headers: corsHeaders });
  }
};
