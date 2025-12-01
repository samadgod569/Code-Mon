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

    const json = (obj, status = 200) =>
      new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...corsHeaders } });

    const CHUNK_SIZE = 150000; // 150 KB per chunk

    // ---------------------------
    // LIST FILES
    // ---------------------------
    if (path === "/api/list") {
      const user = url.searchParams.get("user");
      if (!user) return json({ error: "Missing user" }, 400);

      const list = await env.FILES.list({ prefix: `${user}/` });
      const files = [];

      for (const k of list.keys) {
        // Remove segment suffix if exists
        const name = k.name.replace(`${user}/`, "").replace(/-\d+$/, "");
        if (!files.includes(name)) files.push(name);
      }

      return json({ files });
    }

    // ---------------------------
    // LOAD FILE
    // ---------------------------
    if (path === "/api/load") {
      const user = url.searchParams.get("user");
      const filename = url.searchParams.get("filename");
      if (!user || !filename) return json({ error: "Missing params" }, 400);

      // Try normal file first
      let content = await env.FILES.get(`${user}/${filename}`, "text");

      // If empty, check chunks
      if (!content) {
        let i = 1, part = "";
        content = "";
        while (true) {
          part = await env.FILES.get(`${user}/${filename}-${i}`, "text");
          if (!part) break;
          content += part;
          i++;
        }
      }

      return new Response(content || "", { headers: { "Content-Type": "text/plain", ...corsHeaders } });
    }

    // ---------------------------
    // SAVE FILE
    // ---------------------------
    if (path === "/api/save") {
      let body;
      try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

      const { user, filename, content } = body;
      if (!user || !filename) return json({ error: "Missing params" }, 400);

      // Delete old chunks
      let i = 1;
      while (true) {
        const res = await env.FILES.delete(`${user}/${filename}-${i}`);
        if (!res) break; // if nothing to delete
        i++;
      }

      // Save small file normally
      if (content.length <= CHUNK_SIZE) {
        await env.FILES.put(`${user}/${filename}`, content ?? "");
      } else {
        // Save in chunks
        const totalChunks = Math.ceil(content.length / CHUNK_SIZE);
        for (let i = 0; i < totalChunks; i++) {
          const part = content.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
          await env.FILES.put(`${user}/${filename}-${i + 1}`, part);
        }
      }

      return json({ success: true });
    }

    // ---------------------------
    // DEPLOY FILE
    // ---------------------------
    if (path === "/api/deploy") {
      let body;
      try { body = await request.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }

      const { user, filename } = body;
      if (!user || !filename) return json({ error: "Missing params" }, 400);

      // Load main file
      let content = await env.FILES.get(`${user}/${filename}`, "text") || "";

      // Merge chunks if they exist
      let i = 1, part = "";
      while (true) {
        part = await env.FILES.get(`${user}/${filename}-${i}`, "text");
        if (!part) break;
        content += part;
        i++;
      }

      if (!content) return json({ error: "File not found" }, 404);

      // Save public KV copy
      await env.FILES.put(`public/${user}/${filename}`, content);

      // Upload to GitHub
      const githubToken = await env.FILES.get("GITHUB_TOKEN", "text");
      if (!githubToken) return json({ error: "GitHub token missing in KV" }, 500);

      const githubApiUrl = `https://api.github.com/repos/samadgod569/Code-Mon-space/contents/public/${user}/${filename}`;

      // Check SHA if file exists
      let fileSha = null;
      try {
        const checkRes = await fetch(githubApiUrl, { headers: { "Authorization": `Bearer ${githubToken}` } });
        if (checkRes.ok) fileSha = (await checkRes.json()).sha;
      } catch {}

      // Upload to GitHub
      const uploadBody = {
        message: `Deploy ${user}/${filename}`,
        content: btoa(content),
        branch: "main",
        ...(fileSha ? { sha: fileSha } : {})
      };

      const ghRes = await fetch(githubApiUrl, {
        method: "PUT",
        headers: { "Authorization": `Bearer ${githubToken}`, "Content-Type": "application/json" },
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
