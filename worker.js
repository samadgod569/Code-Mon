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

    // ------------------------------------------------------------
    // HELPER: LOAD FULL FILE (MERGE CHUNKS)
    // ------------------------------------------------------------
    async function loadFullFile(env, user, filename) {
      const base = `${user}/${filename}`;
      const first = await env.FILES.get(base, "text");

      if (first === null) {
        return null;
      }

      // Get all keys for chunked files
      const list = await env.FILES.list({ prefix: `${base}-chunk-` });

      if (list.keys.length === 0) {
        // No chunks, return single file
        return first;
      }

      // Sort chunks numerically
      const chunks = await Promise.all(
        list.keys
          .sort((a, b) => {
            const na = parseInt(a.name.split("-chunk-")[1]);
            const nb = parseInt(b.name.split("-chunk-")[1]);
            return na - nb;
          })
          .map(k => env.FILES.get(k.name, "text"))
      );

      return first + chunks.join("");
    }

    // ------------------------------------------------------------
    // LIST FILES
    // ------------------------------------------------------------
    if (path === "/api/list") {
      const user = url.searchParams.get("user");
      if (!user) return json({ error: "Missing user" }, 400);

      const list = await env.FILES.list({ prefix: `${user}/` });

      const files = new Set();

      for (const k of list.keys) {
        const name = k.name.replace(`${user}/`, "");

        if (!name.includes("-chunk-")) {
          files.add(name);
        }
      }

      return json({ files: [...files] });
    }

    // ------------------------------------------------------------
    // LOAD FILE (MERGE CHUNKS)
    // ------------------------------------------------------------
    if (path === "/api/load") {
      const user = url.searchParams.get("user");
      const filename = url.searchParams.get("filename");
      if (!user || !filename) return json({ error: "Missing params" }, 400);

      const full = await loadFullFile(env, user, filename);

      return new Response(full ?? "", {
        headers: { "Content-Type": "text/plain", ...corsHeaders }
      });
    }

    // ------------------------------------------------------------
    // SAVE FILE (AUTO CHUNK IF LARGE)
    // ------------------------------------------------------------
    if (path === "/api/save") {
      let body;

      try {
        body = await request.json();
      } catch {
        return json({ error: "Invalid JSON" }, 400);
      }

      const { user, filename, content } = body;
      if (!user || !filename) return json({ error: "Missing params" }, 400);

      const base = `${user}/${filename}`;

      // Delete old chunks
      const list = await env.FILES.list({ prefix: `${base}-chunk-` });
      await Promise.all(list.keys.map(k => env.FILES.delete(k.name)));

      // Save main first chunk
      const MAX = 500_000; // 500 KB per chunk to avoid request limit
      await env.FILES.put(base, content.slice(0, MAX));

      // Save remaining chunks
      let index = 1;
      for (let i = MAX; i < content.length; i += MAX) {
        const part = content.slice(i, i + MAX);
        await env.FILES.put(`${base}-chunk-${index}`, part);
        index++;
      }

      return json({ success: true, chunks: index - 1 });
    }

    // ------------------------------------------------------------
    // DEPLOY (MERGE CHUNKS -> SEND TO GITHUB)
    // ------------------------------------------------------------
    if (path === "/api/deploy") {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: "Invalid JSON" }, 400);
      }

      const { user, filename } = body;
      if (!user || !filename) return json({ error: "Missing params" }, 400);

      // Load full content
      const content = await loadFullFile(env, user, filename);
      if (content === null) return json({ error: "File not found" }, 404);

      // Save public copy
      await env.FILES.put(`public/${user}/${filename}`, content);

      // GitHub deploy
      const token = await env.FILES.get("GITHUB_TOKEN", "text");
      if (!token) return json({ error: "Missing GitHub token" }, 500);

      const apiUrl =
        `https://api.github.com/repos/samadgod569/Code-Mon-space/contents/public/${user}/${filename}`;

      let sha = null;

      try {
        const exists = await fetch(apiUrl, {
          headers: {
            "Authorization": `Bearer ${token}`,
            "User-Agent": "CodeMon-Deployer"
          }
        });

        if (exists.ok) sha = (await exists.json()).sha;
      } catch {}

      const ghRes = await fetch(apiUrl, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
          "User-Agent": "CodeMon-Deployer"
        },
        body: JSON.stringify({
          message: `Deploy ${user}/${filename}`,
          content: btoa(content),
          branch: "main",
          ...(sha ? { sha } : {})
        })
      });

      const ghRaw = await ghRes.text();
      let ghJson;
      try {
        ghJson = JSON.parse(ghRaw);
      } catch {
        return json({ error: "GitHub returned non-JSON", raw: ghRaw }, 500);
      }

      if (!ghRes.ok) {
        return json({ error: "GitHub error", details: ghJson }, 500);
      }

      return json({
        success: true,
        url: `https://code-mon.codemon.workers.dev/public/${user}/${filename}`,
        github: ghJson.content?.html_url ?? null
      });
    }

    return new Response("Worker Online", { headers: corsHeaders });
  }
};
