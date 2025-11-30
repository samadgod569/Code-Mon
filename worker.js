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

    // JSON helper
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

      const content = await env.FILES.get(`${user}/${filename}`, "text");

      return new Response(content || "", {
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

      // Read request JSON ONCE (fixes "body used" error)
      try {
        body = await request.json();
      } catch {
        return json({ error: "Invalid JSON body" }, 400);
      }

      const { user, filename } = body;

      if (!user || !filename)
        return json({ error: "Missing parameters" }, 400);

      try {
        // Load file CONTENT as TEXT (fixes stream issue)
        const content = await env.FILES.get(`${user}/${filename}`, "text");
        if (!content) return json({ error: "File not found" }, 404);

        // Save into public folder
        await env.FILES.put(`public/${filename}`, content);

        // Load GitHub token from KV (as text)
        const githubToken = await env.FILES.get("GITHUB_TOKEN", "text");
        if (!githubToken)
          return json({ error: "GitHub token not found in KV" }, 500);

        // Build GitHub API URL
        const githubUrl =
          `https://api.github.com/repos/samadgod569/Code-Mon/contents/public/${filename}`;

        // Upload to GitHub
        const res = await fetch(githubUrl, {
          method: "PUT",
          headers: {
            "Authorization": `Bearer ${githubToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            message: `Deploy ${filename}`,
            content: btoa(content),   // safe because content is a string
            branch: "main"
          })
        });

        // Parse GitHub JSON safely
        let githubData;
        try {
          githubData = await res.json();
        } catch (e) {
          const raw = await res.text();
          return json({ error: "GitHub returned non-JSON", raw }, 500);
        }

        // GitHub error
        if (!res.ok) {
          return json({
            error: "GitHub error",
            details: githubData
          }, 500);
        }

        // SUCCESS
        return json({
          success: true,
          url: `https://code-mon.codemon.workers.dev/public/${filename}`,
          github: githubData.content?.html_url || null
        });

      } catch (err) {
        return json({ error: "Deploy failed: " + err.message }, 500);
      }
    }

    // ---------------------------
    // DEFAULT RESPONSE
    // ---------------------------
    return new Response("Worker Online", { headers: corsHeaders });
  }
};
