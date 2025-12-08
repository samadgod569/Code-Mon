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


    
    // Cloudflare Worker example


    if (path === "/api/ai") {
      const username = url.searchParams.get("username");
      const name = url.searchParams.get("name");
      const key = url.searchParams.get("key");
      const trainingText = url.searchParams.get("trainingText") || "";

      if (!username || !name || !key) {
        return new Response("Missing required fields", { status: 400 });
      }

      // Store in KV (AI is a bound KV namespace in Worker)
      await env.AI.put(`ai/${username}/${name}`, `${key}[*]${trainingText}`);

      return new Response(`AI ${name} created successfully!`);
    }

    

    // ---------------------------
    // Get AI response (Gemini)
    // ---------------------------
    

  
if (path === "/api/ai-get") {
  const username = url.searchParams.get("username");
  const name = url.searchParams.get("name");
  const question = url.searchParams.get("question") || "";

  if (!username || !name) {
    return new Response("Missing username or name", { status: 400 });
  }

  // Load stored:  key[*]trainingText
  const stored = await env.AI.get(`ai/${username}/${name}`, { type: "text" });
  if (!stored) {
    return new Response("AI not found", { status: 404 });
  }

  const [apiKey, trainingText] = stored.split("[*]");

  // Build Gemini request
  const body = {
    system_instruction: {
      parts: [
        { text: `You are a custom AI trained with the following data:\n${trainingText}` }
      ]
    },
    contents: [
      { parts: [{ text: question }] }
    ],
    generationConfig: {
      maxOutputTokens: 4096,
      temperature: 0.4
    }
  };

  // Call Gemini 2.5 Flash
  const geminiResp = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify(body)
    }
  );

  // Handle errors safely
  if (!geminiResp.ok) {
    let err;
    try { err = await geminiResp.json(); }
    catch { err = await geminiResp.text(); }

    return new Response(JSON.stringify({
      error: "Gemini API error",
      status: geminiResp.status,
      details: err
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  const data = await geminiResp.json();
  const answer =
    data?.candidates?.[0]?.content?.parts?.map(p => p.text).join("") ||
    "No response from Gemini.";

  return new Response(answer, {
    headers: {
      "Content-Type": "text/plain",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
    
// ---------------------------------------------------------  
// /api/api-get  → simple GET/POST KV  
// ---------------------------------------------------------  
if (path === "/api/api-get") {  
  const method = url.searchParams.get("method");  
  const key = url.searchParams.get("key");  
  const value = url.searchParams.get("value");  

  if (!method || !key) {  
    return new Response(JSON.stringify({
      error: "Missing required parameters: method & key"
    }), {  
      status: 400,  
      headers: { "Content-Type": "application/json", ...corsHeaders }  
    });  
  }  

  // POST → store value  
  if (method.toUpperCase() === "POST") {  
    if (!value) {  
      return new Response(JSON.stringify({
        error: "Missing value for POST method"
      }), {  
        status: 400,  
        headers: { "Content-Type": "application/json", ...corsHeaders }  
      });  
    }  

    await env.AI.put(key, value);  

    return new Response(JSON.stringify({
      success: true,
      message: "Value stored successfully",
      key,
      value
    }), {  
      headers: { "Content-Type": "application/json", ...corsHeaders }  
    });  
  }  
// ------------------------------
// LIST → return all keys stored in env.AI
// ------------------------------
if (method.toUpperCase() === "LIST") {
  const list = await env.AI.list();

  const items = await Promise.all(
    list.keys.map(async k => {
      const value = await env.AI.get(k.name, { type: "text" });
      return { key: k.name, value };
    })
  );

  return new Response(JSON.stringify({
    success: true,
    count: items.length,
    items
  }), {
    headers: { "Content-Type": "application/json" }
  });
}
  // GET → read value  
  if (method.toUpperCase() === "GET") {  
    const stored = await env.AI.get(key, { type: "text" });  

    if (stored === null) {  
      return new Response(JSON.stringify({
        success: false,
        error: "Key not found"
      }), {  
        status: 404,  
        headers: { "Content-Type": "application/json", ...corsHeaders }  
      });  
    }  

    return new Response(JSON.stringify({
      success: true,
      key,
      value: stored
    }), {  
      headers: { "Content-Type": "application/json", ...corsHeaders }  
    });  
  }  

  return new Response(JSON.stringify({
    error: "Invalid method. Use GET or POST."
  }), {  
    status: 400,  
    headers: { "Content-Type": "application/json", ...corsHeaders }  
  });  
    }
    
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

      if (!user || !filename)
        return json({ error: "Missing params" }, 400);

      const stored = await env.FILES.get(`${user}/${filename}`, { type: "text" });

      return new Response(stored || "", {
        headers: {
          "Content-Type": "text/plain",
          ...corsHeaders
        }
      });
    }

    // ---------------------------------------------------------
    // /api/pro-api  (Check stored API key)
    // ---------------------------------------------------------
    if (path === "/api/pro-api") {
      const username = url.searchParams.get("username");
      const key = url.searchParams.get("key");
      const value = url.searchParams.get("value");

      if (!username || !key || !value)
        return json({ success: false, error: "Missing username, key or value" }, 400);

      const storageKey = `${username}/${key}`;
      const storedValue = await env.PRO.get(storageKey, { type: "text" });

      if (!storedValue)
        return json({ success: false, error: "Key not found" }, 404);

      return json({ success: storedValue === value });
    }

// --------------------------------------------------------
// /api/pb-api-pro  → Return ALL protected keys + values
// --------------------------------------------------------
if (path === "/api/pb-api-pro") {
    const username = url.searchParams.get("username");
    const pass = url.searchParams.get("pass");

    if (!username || !pass) {
        return json({ success: false, error: "Missing username or pass" }, 400);
    }

    // Validate password
    const storedPass = await env.Pass.get(username, { type: "text" });

    if (!storedPass)
        return json({ success: false, error: "Username not found" }, 404);

    if (storedPass !== pass)
        return json({ success: false, error: "Incorrect username or password" }, 403);

    // List all keys for this user
    const prefix = `${username}/`;
    const list = await env.PRO.list({ prefix });

    const result = {};

    // Fetch values for each key
    for (const item of list.keys) {
        const name = item.name.replace(prefix, "");
        const value = await env.PRO.get(item.name, { type: "text" });
        result[name] = value || null;
    }

    return json({
        success: true,
        count: Object.keys(result).length,
        data: result
    });
  }

    // ---------------------------------------------------------
    // /api/pb-api (simple KV read/write/list)
    // ---------------------------------------------------------
    if (path === "/api/pb-api") {
      const username = url.searchParams.get("username");
      const method = url.searchParams.get("method");
      const name = url.searchParams.get("name");
      const value = url.searchParams.get("value");

      if (!username || !method)
        return json({ error: "Missing parameters" }, 400);

      // POST
      if (method.toUpperCase() === "POST") {
        if (!name || !value)
          return json({ error: "Missing name or value" }, 400);

        await env.API.put(`${username}/${name}`, value);
        return json({ success: true });
      }

      // GET
      if (method.toUpperCase() === "GET") {
        if (!name)
          return json({ error: "Missing name for GET" }, 400);

        const stored = await env.API.get(`${username}/${name}`, { type: "text" });

        return json({
          success: stored !== null,
          value: stored
        });
      }

      // LIST
      // LIST → Return all keys + values for this user
if (method.toUpperCase() === "LIST") {
    const prefix = `${username}/`;
    const list = await env.API.list({ prefix });

    const items = await Promise.all(
        list.keys.map(async k => {
            const keyName = k.name.replace(prefix, "");
            const value = await env.API.get(k.name);
            return { name: keyName, value: value };
        })
    );

    return json({
        success: true,
        items
    });
}

      return json({ error: "Unsupported method" }, 400);
    }
// ---------------------------------------------------------
// /api/pro-api-deploy  (simple key deploy)
// ---------------------------------------------------------
if (path === "/api/pro-api-deploy") {

    const username = url.searchParams.get("username");
    const text = url.searchParams.get("text");
    const value = url.searchParams.get("value");

    if (!username || !text || !value) {
        return json({ success: false, error: "Missing username, text, or value" }, 400);
    }

    const storageKey = `${username}/${text}`;

    await env.PRO.put(storageKey, value);

    return json({ success: true, key: storageKey });
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

      if (!user || !filename)
        return json({ error: "Missing params" }, 400);

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

      const storedPass = await env.Pass.get(username, { type: "text" });

      if (!storedPass)
        return json({ success: false, error: "Username not found" }, 404);

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

      const existing = await env.Pass.get(username, { type: "text" });

      if (existing)
        return json({ success: false, error: "Username already exists" }, 409);

      await env.Pass.put(username, pass);
      return json({ success: true });
    }

    // ---------------------------------------------------
    // /api/deploy — Sync KV -> GitHub
    // ---------------------------------------------------
    if (path === "/api/deploy") {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: "Invalid JSON body" }, 400);
      }

      const { user, filename } = body;
      if (!user || !filename)
        return json({ error: "Missing params" }, 400);

      const stored = await env.FILES.get(`${user}/${filename}`, { type: "text" });

      if (!stored)
        return json({ error: "File not found" }, 404);

      await env.FILES.put(`public/${user}/${filename}`, stored);

      const githubToken = await env.FILES.get("GITHUB_TOKEN", { type: "text" });

      if (!githubToken)
        return json({ error: "GitHub token missing in KV" }, 500);

      const githubApiUrl = `https://api.github.com/repos/samadgod569/Code-Mon-space/contents/public/${user}/${filename}`;

      // Check if exists
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
      } catch {}

      const uploadBody = {
        message: `Deploy ${user}/${filename}`,
        content: btoa(unescape(encodeURIComponent(stored))), // UTF-8 safe
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
      let ghJson = null;

      try {
        ghJson = JSON.parse(raw);
      } catch {
        return json({ error: "GitHub invalid JSON", raw }, 500);
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

    // ---------------------------
    // DEFAULT
    // ---------------------------
    return new Response("Worker Online", { headers: corsHeaders });
  }
};
