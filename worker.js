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

    // ---------------- LIST FILES ----------------
    if (path === "/api/list") {
      const user = url.searchParams.get("user");
      if (!user) return json({ error: "Missing user" }, 400);
      const list = await env.FILES.list({ prefix: `${user}/` });
      return json({ files: list.keys.map(k => k.name.replace(`${user}/`, "")) });
    }

    // ---------------- LOAD FILE ----------------
    if (path === "/api/load") {
      const user = url.searchParams.get("user");
      const filename = url.searchParams.get("filename");
      if (!user || !filename) return json({ error: "Missing params" }, 400);
      const stored = await env.FILES.get(`${user}/${filename}`, "text");
      return new Response(stored || "", { headers: { "Content-Type": "text/plain", ...corsHeaders } });
    }

    // ---------------- SAVE FILE (supports FormData) ----------------
    if (path === "/api/save") {
      let form;
      try {
        form = await request.formData();
      } catch {
        return json({ error: "Invalid form data" }, 400);
      }
      const user = form.get("user");
      const filename = form.get("filename");
      const content = form.get("content") ?? "";
      if (!user || !filename) return json({ error: "Missing params" }, 400);
      await env.FILES.put(`${user}/${filename}`, content);
      return json({ success: true });
    }

    // ---------------- DEPLOY FILE (supports FormData) ----------------
    if (path === "/api/deploy") {
      let form;
      try {
        form = await request.formData();
      } catch {
        return json({ error: "Invalid form data" }, 400);
      }
      const user = form.get("user");
      const filename = form.get("filename");
      if (!user || !filename) return json({ error: "Missing params" }, 400);

      const stored = await env.FILES.get(`${user}/${filename}`, "text");
      if (!stored) return json({ error: "File not found" }, 404);

      await env.FILES.put(`public/${user}/${filename}`, stored);

      const githubToken = await env.FILES.get("GITHUB_TOKEN", "text");
      if (!githubToken) return json({ error: "GitHub token missing in KV" }, 500);

      const githubApiUrl = `https://api.github.com/repos/samadgod569/Code-Mon-space/contents/public/${user}/${filename}`;
      let fileSha = null;

      try {
        const checkRes = await fetch(githubApiUrl, {
          headers: { "Authorization": `Bearer ${githubToken}`, "User-Agent": "CodeMon-Deployer" }
        });
        if (checkRes.ok) fileSha = (await checkRes.json()).sha;
      } catch {}

      const uploadBody = {
        message: `Deploy ${user}/${filename}`,
        content: btoa(stored),
        branch: "main",
        ...(fileSha ? { sha: fileSha } : {})
      };

      const ghRes = await fetch(githubApiUrl, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${githubToken}`,
          "Content-Type": "application/json",
          "User-Agent": "CodeMon-Deployer"
        },
        body: JSON.stringify(uploadBody)
      });

      const raw = await ghRes.text();
      let ghJson;
      try { ghJson = JSON.parse(raw); } catch { return json({ error: "GitHub invalid JSON", raw }, 500); }
      if (!ghRes.ok) return json({ error: "GitHub error", details: ghJson }, 500);

      return json({
        success: true,
        url: `https://code-mon.codemon.workers.dev/public/${user}/${filename}`,
        github: ghJson.content?.html_url ?? null
      });
    }

    return new Response("Worker Online", { headers: corsHeaders });
  }
};
