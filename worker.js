export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // -----------------------
    // CORS headers
    // -----------------------
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

      try {
        const list = await env.FILES.list({ prefix: `${user}/` });
        return json({ files: list.keys.map(k => k.name.replace(`${user}/`, "")) });
      } catch (err) {
        return json({ error: "Failed to list files: " + err.message }, 500);
      }
    }

    // ---------------------------
    // LOAD FILE
    // ---------------------------
    if (path === "/api/load") {
      const user = url.searchParams.get("user");
      const filename = url.searchParams.get("filename");
      if (!user || !filename) return json({ error: "Missing parameters" }, 400);

      try {
        const content = await env.FILES.get(`${user}/${filename}`);
        return new Response(content || "", {
          headers: { "Content-Type": "text/plain", ...corsHeaders }
        });
      } catch (err) {
        return json({ error: "Failed to load file: " + err.message }, 500);
      }
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

      if (!body.user || !body.filename) return json({ error: "Missing parameters" }, 400);

      try {
        await env.FILES.put(`${body.user}/${body.filename}`, body.content || "");
        return json({ success: true });
      } catch (err) {
        return json({ error: "Failed to save file: " + err.message }, 500);
      }
    }

    // ---------------------------
    // DEPLOY FILE
    // ---------------------------
    if (path === "/api/deploy") {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: "Invalid JSON body" }, 400);
      }

      const { user, filename } = body;
      if (!user || !filename) return json({ error: "Missing parameters" }, 400);

      try {
        // Get file content
        const content = await env.FILES.get(`${user}/${filename}`);
        if (!content) return json({ error: "File not found" }, 404);

        // Save to "public" in same KV (separate key)
        await env.FILES.put(`public/${filename}`, content);

        // Get GitHub token from KV
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
          return json({ error: "GitHub error", details: githubData }, 500);
        }

        return json({
          success: true,
          url: `https://code-mon.codemon.workers.dev/public/${filename}`,
          github: githubData.content?.html_url || null
        });

      } catch (err) {
        return json({ error: "Deploy failed: " + err.message }, 500);
      }
    }

    // Default
    return new Response("Worker Online", { headers: corsHeaders });
  }
};
