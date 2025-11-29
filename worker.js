export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };

    if (request.method === "OPTIONS") {
      return new Response("", { status: 204, headers: corsHeaders });
    }

    // Helper JSON response
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
      return json({ files: list.keys.map(k => k.name.replace(`${user}/`, "")) });
    }

    // ---------------------------
    // LOAD FILE
    // ---------------------------
    if (path === "/api/load") {
      const user = url.searchParams.get("user");
      const filename = url.searchParams.get("filename");

      if (!user || !filename) return json({ error: "Missing parameters" }, 400);

      const content = await env.FILES.get(`${user}/${filename}`);
      return new Response(content || "", {
        headers: { "Content-Type": "text/plain", ...corsHeaders }
      });
    }

    // ---------------------------
    // SAVE FILE
    // ---------------------------
    if (path === "/api/save") {
      const body = await request.json();
      if (!body.user || !body.filename)
        return json({ error: "Missing parameters" }, 400);

      await env.FILES.put(`${body.user}/${body.filename}`, body.content || "");
      return json({ success: true });
    }

    // ---------------------------
    // DEPLOY FILE + PUSH TO GITHUB
    // ---------------------------
    if (path === "/api/deploy") {
      try {
        const { user, filename } = await request.json();
        if (!user || !filename) return json({ error: "Missing parameters" }, 400);

        const content = await env.FILES.get(`${user}/${filename}`);
        if (!content) return json({ error: "File not found" }, 404);

        // Store in public folder
        await env.FILES.put(`public/${filename}`, content);

        // Fetch GitHub token from FILES KV
        const githubToken = await env.FILES.get("GITHUB_TOKEN");
        if (!githubToken) return json({ error: "GitHub token not found in KV" }, 500);

        // Push to GitHub
        const githubUrl = `https://api.github.com/repos/samadgod569/Code-Mon/contents/public/${filename}`;
        const res = await fetch(githubUrl, {
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
          githubData = await res.json();
        } catch (err) {
          return json({ error: "GitHub response is not valid JSON", details: await res.text() }, 500);
        }

        if (!res.ok) {
          return json({
            error: "GitHub error",
            details: githubData
          }, 500);
        }

        return json({
          success: true,
          url: `https://code-mon.codemon.workers.dev/public/${filename}`,
          github: githubData.content?.html_url || null
        });

      } catch (err) {
        return json({ error: err.message }, 500);
      }
    }

    return new Response("Worker Online", { headers: corsHeaders });
  }
};
