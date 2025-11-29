export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // ---- List all files for a user ----
    if (path === "/api/list") {
      const user = url.searchParams.get("user");
      if (!user) return new Response("Missing user", { status: 400, headers: corsHeaders });

      const list = await env.FILES.list({ prefix: `${user}/` });
      return new Response(
        JSON.stringify(list.keys.map((k) => k.name.replace(`${user}/`, ""))),
        { headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // ---- Save a file ----
    if (path === "/api/save") {
      try {
        const { user, filename, content } = await request.json();
        if (!user || !filename) return new Response("Missing params", { status: 400, headers: corsHeaders });

        await env.FILES.put(`${user}/${filename}`, content || "");
        return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
      } catch (err) {
        return new Response(err.message, { status: 500, headers: corsHeaders });
      }
    }

    // ---- Load a file ----
    if (path === "/api/load") {
      const user = url.searchParams.get("user");
      const filename = url.searchParams.get("filename");
      if (!user || !filename) return new Response("Missing params", { status: 400, headers: corsHeaders });

      const content = await env.FILES.get(`${user}/${filename}`);
      return new Response(content || "", { headers: { "Content-Type": "text/plain", ...corsHeaders } });
    }

    // ---- Deploy file to KV public folder AND GitHub ----
    if (path === "/api/deploy") {
      try {
        const { user, filename } = await request.json();
        if (!user || !filename) return new Response("Missing params", { status: 400, headers: corsHeaders });

        const content = await env.FILES.get(`${user}/${filename}`);
        if (!content) return new Response("File not found", { status: 404, headers: corsHeaders });

        // Save to KV public folder
        await env.FILES.put(`public/${filename}`, content);

        // Push to GitHub
        const githubApiUrl = `https://api.github.com/repos/samadgod569/Code-Mon/contents/public/${filename}`;
        const res = await fetch(githubApiUrl, {
          method: "PUT",
          headers: {
            "Authorization": `token ${env.GITHUB_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: `Deploy ${filename}`,
            content: btoa(content),
            branch: "main"
          })
        });
        const data = await res.json();

        return new Response(JSON.stringify({
          success: true,
          kv_url: `/public/${filename}`,
          github_url: data.content?.html_url || null
        }), { headers: { "Content-Type": "application/json", ...corsHeaders } });

      } catch (err) {
        return new Response(err.message, { status: 500, headers: corsHeaders });
      }
    }

    // ---- Default response ----
    return new Response("Worker running", { status: 200, headers: corsHeaders });
  }
};
