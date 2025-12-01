export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };
    if (request.method === "OPTIONS") return new Response("", { status: 204, headers: corsHeaders });

    const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...corsHeaders } });

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

    // ---------------- SAVE FILE ----------------
    if (path === "/api/save") {
      let body; try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
      const { user, filename, content } = body;
      if (!user || !filename) return json({ error: "Missing params" }, 400);
      await env.FILES.put(`${user}/${filename}`, content ?? "");
      return json({ success: true });
    }

    // ---------------- CHUNK UPLOAD ----------------
    if (path === "/api/upload-chunk") {
      let body; try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
      const { user, filename, index, total, data } = body;
      if (!user || !filename || index == null || !total) return json({ error: "Missing params" }, 400);
      await env.FILES.put(`chunks/${user}/${filename}/${index}`, data);
      return json({ success: true, index });
    }

    // ---------------- DEPLOY (MERGE CHUNKS) ----------------
    if (path === "/api/deploy") {
      let body; try { body = await request.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }
      const { user, filename } = body;
      if (!user || !filename) return json({ error: "Missing params" }, 400);

      const chunkList = await env.FILES.list({ prefix: `chunks/${user}/${filename}/` });
      if (chunkList.keys.length === 0) return json({ error: "No chunks uploaded" });

      const sorted = chunkList.keys.sort((a, b) => parseInt(a.name.split("/").pop()) - parseInt(b.name.split("/").pop()));
      let full = "";
      for (const f of sorted) full += await env.FILES.get(f.name, "text");

      await env.FILES.put(`${user}/${filename}`, full);

      for (const f of sorted) await env.FILES.delete(f.name);

      // Save public copy
      await env.FILES.put(`public/${user}/${filename}`, full);

      const githubToken = await env.FILES.get("GITHUB_TOKEN", "text");
      if (!githubToken) return json({ error: "GitHub token missing in KV" }, 500);
      const githubUrl = `https://api.github.com/repos/samadgod569/Code-Mon-space/contents/public/${user}/${filename}`;

      let sha = null;
      try {
        const check = await fetch(githubUrl, { headers: { "Authorization": `Bearer ${githubToken}` } });
        if (check.ok) sha = (await check.json()).sha;
      } catch {}

      const ghRes = await fetch(githubUrl, {
        method: "PUT",
        headers: { "Authorization": `Bearer ${githubToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ message: `Deploy ${user}/${filename}`, content: btoa(full), branch: "main", ...(sha ? { sha } : {}) })
      });

      const ghData = await ghRes.json();
      if (!ghRes.ok) return json({ error: "GitHub error", details: ghData }, 500);

      return json({ success: true, url: `https://code-mon.codemon.workers.dev/public/${user}/${filename}`, github: ghData.content?.html_url ?? null });
    }

    return new Response("Worker Online", { headers: corsHeaders });
  }
};
