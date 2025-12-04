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
      return new Response("", {
        status: 204,
        headers: corsHeaders
      });
    }

    const json = (obj, status = 200) =>
      new Response(JSON.stringify(obj), {
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
    // ---------------------------
// LOAD FILE
// ---------------------------
if (path === "/api/load") {
  const user = url.searchParams.get("user");
  const filename = url.searchParams.get("filename");

  if (!user || !filename) 
    return json({ error: "Missing params" }, 400);

  // FIXED: Cloudflare KV MUST use { type: "text" }
  const stored = await env.FILES.get(`${user}/${filename}`, { type: "text" });

  return new Response(stored || "", {
    headers: { 
      "Content-Type": "text/plain",
      ...corsHeaders 
    }
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
        return json({ error: "Invalid JSON" }, 400);
      }

      const { user, filename, content } = body;
      if (!user || !filename) return json({ error: "Missing params" }, 400);

      await env.FILES.put(`${user}/${filename}`, content ?? "");

      return json({ success: true });
    }
// ---------------------------
// LOGIN
// ---------------------------
if (path === "/api/pass") {
  const username = url.searchParams.get("username");
  const pass = url.searchParams.get("pass");

  if (!username || !pass)
    return json({ success: false, error: "Missing username or password" }, 400);

  // Get stored pass
  const storedPass = await env.Pass.get(username, "text");

  if (!storedPass)
    return json({ success: false, error: "Username not found" }, 404);

  // Check password
  if (storedPass !== pass)
    return json({ success: false, error: "Incorrect username or password" }, 403);

  return json({ success: true });
}
    // ---------------------------
// SIGNUP
// ---------------------------
if (path === "/api/pass-deploy") {
  const username = url.searchParams.get("username");
  const pass = url.searchParams.get("pass");

  if (!username || !pass)
    return json({ success: false, error: "Missing username or password" }, 400);

  // Check if already exists
  const existing = await env.Pass.get(username, "text");

  if (existing)
    return json({ success: false, error: "Username already exists" }, 409);

  // Save to KV
  await env.Pass.put(username, pass);

  return json({ success: true });
}
    // ---------------------------------------------------
    // DEPLOY (UPLOAD ONLY TO: Code-Mon-space)
    // ---------------------------------------------------
    if (path === "/api/deploy") {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { user, filename } = body;
  if (!user || !filename) return json({ error: "Missing params" }, 400);

  // Load file from KV
  const stored = await env.FILES.get(`${user}/${filename}`, "text");
  if (!stored) return json({ error: "File not found" }, 404);

  // Save a public copy inside KV
  await env.FILES.put(`public/${user}/${filename}`, stored);

  // Load GitHub token
  const githubToken = await env.FILES.get("GITHUB_TOKEN", "text");
  if (!githubToken)
    return json({ error: "GitHub token missing in KV" }, 500);

  const githubApiUrl =
    `https://api.github.com/repos/samadgod569/Code-Mon-space/contents/public/${user}/${filename}`;

  // -------------------------------
  // Check if file exists to get SHA
  // -------------------------------
  let fileSha = null;
  try {
    const checkRes = await fetch(githubApiUrl, {
      headers: {
        "Authorization": `Bearer ${githubToken}`,
        "User-Agent": "CodeMon-Deployer"
      }
    });

    if (checkRes.ok) {
      const fileInfo = await checkRes.json();
      fileSha = fileInfo.sha;
    }
  } catch (err) {
    // ignore errors; assume file doesn't exist
  }

  // -------------------------------
  // Upload to GitHub
  // -------------------------------
  const uploadBody = {
    message: `Deploy ${user}/${filename}`,
    content: btoa(stored),
    branch: "main",
    ...(fileSha ? { sha: fileSha } : {}) // include SHA if updating
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
  try {
    ghJson = JSON.parse(raw);
  } catch {
    return json({ error: "GitHub invalid JSON", raw }, 500);
  }

  if (!ghRes.ok) {
    return json({ error: "GitHub error", details: ghJson }, 500);
  }

  // SUCCESS
  return json({
    success: true,
    url: `https://code-mon.codemon.workers.dev/public/${user}/${filename}`,
    github: ghJson.content?.html_url ?? null
  });
    }
    // ---------------------------
    // DEFAULT
    // ---------------------------
    return new Response("Worker Online", { headers: corsHeaders });
  }
};
