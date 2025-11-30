export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // ---------------------------
    // CORS
    // ---------------------------
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };

    if (request.method === "OPTIONS") {
      return new Response("", { status: 204, headers: corsHeaders });
    }

    const json = (data, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json", ...corsHeaders }
      });

    // ---------------------------
    // LIST FILES
    // ---------------------------
    if (path === "/api/list") {
      const user = url.searchParams.get("user");
      if (!user) return json({ error: "Missing user" }, 400);

      const list = await env.FILES.list({ prefix: `${user}/` });

      return json({
        files: list.keys.map(k => k.name.replace(`${user}/`, ""))
      });
    }

    // ---------------------------
    // LOAD FILE
    // ---------------------------
    if (path === "/api/load") {
      const user = url.searchParams.get("user");
      const filename = url.searchParams.get("filename");

      if (!user || !filename) return json({ error: "Missing parameters" }, 400);

      const stored = await env.FILES.get(`${user}/${filename}`);
      const content = stored ? await stored.text() : "";

      return new Response(content, {
        headers: { "Content-Type": "text/plain", ...corsHeaders }
      });
    }

    // ---------------------------
    // SAVE FILE
    // ---------------------------
    if (path === "/api/save") {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: "Invalid JSON body" }, 400);
      }

      if (!body.user || !body.filename)
        return json({ error: "Missing parameters" }, 400);

      await env.FILES.put(`${body.user}/${body.filename}`, body.content || "");

      return json({ success: true });
    }

    // ---------------------------
    // DEPLOY FILE + PUSH TO GITHUB
    // ---------------------------
    if (path === "/api/deploy") {
      let body;

      // Read body ONCE
      try {
        body = await request.json();
      } catch {
        return json({ error: "Invalid JSON body" }, 400);
      }

      const { user, filename } = body;
      if (!user || !filename) return json({ error: "Missing parameters" }, 400);

      try {
        // SAFE text read (fixes stream reuse error)
        const stored = await env.FILES.get(`${user}/${filename}`);
        const content = stored ? await stored.text() : null;

        if (!content) return json({ error: "File not found" }, 404);

        // Save public file
        await env.FILES.put(`public/${filename}`, content);

        // Load GitHub token
        const githubToken = await env.FILES.get("GITHUB_TOKEN", "text");
        if (!githubToken)
          return json({ error: "GitHub token missing in KV" }, 500);

        const githubUrl =
          `https://api.github.com/repos/samadgod569/Code-Mon/contents/public/${filename}`;

        const uploadRes = await fetch(githubUrl, {
          method: "PUT",
          headers: {
            "Authorization": `Bearer ${githubToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            message: `Deploy ${filename}`,
            content: btoa(content),
            branch: "main"
          })
        });

        let githubData;
        try {
          githubData = await uploadRes.json();
        } catch {
          const raw = await uploadRes.text();
          return json({ error: "GitHub returned invalid JSON", raw }, 500);
        }

        if (!uploadRes.ok) {
          return json({ error: "GitHub error", details: githubData }, 500);
        }

        return json({
          success: true,
          url: `https://code-mon.codemon.workers.dev/public/${filename}`,
          github: githubData.content?.html_url ?? null
        });

      } catch (err) {
        return json({ error: "Deploy failed: " + err.message }, 500);
      }
    }

    // ---------------------------
    // DEFAULT
    // ---------------------------
    return new Response("Worker Online", { headers: corsHeaders });
  }
};
