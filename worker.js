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
  "Access-Control-Allow-Headers": 
  "*, Content-Type, x-user, x-pass, x-filename"
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

    if (path === "/api/worker-vm") {

  // Require API key
  const suppliedKey = request.headers.get("x-api-key");
  const storedKey = await env.FILES.get("MASTER_KEY", { type: "text" });

  if (!storedKey) {
    return json({
      error: "VM API key not configured in KV"
    }, 500);
  }

  if (suppliedKey !== storedKey) {
    return json({
      error: "Invalid or missing API key"
    }, 403);
  }

  // -------- VM LEVEL 2 (DROP-IN READY) ----------

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "POST only" }), { status: 405 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
    }

    const { scripts = [], input = null } = body;
    if (!Array.isArray(scripts) || scripts.length === 0) {
      return new Response(JSON.stringify({ error: "scripts[] required" }), { status: 400 });
    }

    // ------------------------------------------------
    // LEVEL 2 — ADVANCED VM ENVIRONMENT
    // ------------------------------------------------

    // Virtual filesystem
    const FS = {
      _files: {},
      write(path, content) {
        const now = Date.now();
        this._files[path] = { content, updated: now };
      },
      read(path) {
        return this._files[path]?.content ?? null;
      },
      list() {
        return Object.keys(this._files);
      },
      meta(path) {
        return this._files[path] || null;
      }
    };

    // Key-value STORE
    const STORE = {
      _db: {},
      set(ns, key, val) {
        if (!this._db[ns]) this._db[ns] = {};
        this._db[ns][key] = val;
      },
      get(ns, key) {
        return this._db[ns]?.[key] ?? null;
      },
      ns(ns) {
        return this._db[ns] || {};
      }
    };

    // Logs
    const logs = [];
    const consoleProxy = {
      log: (...a) => logs.push(a.join(" ")),
      error: (...a) => logs.push("ERROR: " + a.join(" ")),
      warn: (...a) => logs.push("WARN: " + a.join(" "))
    };

    // delay()
    const delay = (ms) => new Promise(r => setTimeout(r, ms));

    // fakeFetch()
    const fakeFetch = async (url, opts = {}) => {
      await delay(60);
      return {
        ok: true,
        status: 200,
        json: async () => ({ url, opts, message: "Fake fetch success" }),
        text: async () => "Fake fetch text"
      };
    };

    // Events
    const EVENT_BUS = {};
    const emit = (name, data) => {
      if (EVENT_BUS[name]) EVENT_BUS[name].forEach(cb => cb(data));
    };
    const on = (name, handler) => {
      if (!EVENT_BUS[name]) EVENT_BUS[name] = [];
      EVENT_BUS[name].push(handler);
    };

    // ------------------------------------------------
    // LEVEL 2 ADDITIONS
    // ------------------------------------------------

    // 1) Timers
    const timers = new Set();
    const vmSetTimeout = (fn, ms) => {
      const id = setTimeout(() => {
        timers.delete(id);
        fn();
      }, ms);
      timers.add(id);
      return id;
    };
    const vmSetInterval = (fn, ms) => {
      const id = setInterval(fn, ms);
      timers.add(id);
      return id;
    };
    const clearAllTimers = () => {
      for (const id of timers) clearInterval(id);
    };

    // 2) Crypto Tools
    const cryptoTools = {
      uuid() {
        return crypto.randomUUID();
      },
      rand(size = 16) {
        const arr = new Uint8Array(size);
        crypto.getRandomValues(arr);
        return [...arr];
      },
      async hash(str) {
        const enc = new TextEncoder().encode(str);
        const digest = await crypto.subtle.digest("SHA-256", enc);
        return [...new Uint8Array(digest)]
          .map(b => b.toString(16).padStart(2, "0"))
          .join("");
      }
    };

    // 3) Modules
    const MODULES = {};
    const defineModule = (name, exports) => {
      MODULES[name] = exports;
    };
    const requireModule = (name) => {
      if (!MODULES[name]) throw new Error(`Module '${name}' not found`);
      return MODULES[name];
    };

    // 4) Snapshot / Rollback
    const snapshot = () =>
      JSON.stringify({ FS: FS._files, STORE: STORE._db });

    const rollback = (snap) => {
      const data = JSON.parse(snap);
      FS._files = data.FS;
      STORE._db = data.STORE;
    };

    // 5) Timeout protection
    const MAX_EXEC_TIME = 1500;
    const startTime = Date.now();
    const checkTimeout = () => {
      if (Date.now() - startTime > MAX_EXEC_TIME) {
        throw new Error("VM Timeout: script exceeded execution limit");
      }
    };

    // ------------------------------------------------
    // EXECUTOR
    // ------------------------------------------------

    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

    let state = input;

    try {
      for (let i = 0; i < scripts.length; i++) {
        checkTimeout();

        const code = scripts[i];

        const func = new AsyncFunction(
          "state", "FS", "STORE", "fetch", "console", "delay",
          "emit", "on", "setTimeout", "setInterval",
          "crypto", "require", "module", "snapshot", "rollback",
          code
        );

        state = await func(
          state, FS, STORE, fakeFetch, consoleProxy, delay,
          emit, on, vmSetTimeout, vmSetInterval,
          cryptoTools, requireModule, defineModule, snapshot, rollback
        );
      }

      clearAllTimers();

      return new Response(
        JSON.stringify({
          success: true,
          result: state,
          logs,
          fs: FS._files,
          store: STORE._db
        }),
        { headers: { "Content-Type": "application/json" } }
      );

    } catch (err) {
      clearAllTimers();
      return new Response(
        JSON.stringify({
          success: false,
          error: String(err),
          logs
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }
      }
   // ---------------------------------------------------------
// /api/saveDeploy
// ---------------------------------------------------------
if (path === "/api/saveDeploy") {
  const user = url.searchParams.get("user");
  const filename = url.searchParams.get("filename");

  if (!user || !filename) {
    return new Response("Missing user or filename", { status: 400 });
  }

  // JUST CALL /api/load
  const res = await fetch(
    `https://code-mon.codemon.workers.dev/api/load?user=${user}&filename=${filename}`
  );

  // RETURN EXACTLY WHAT /api/load RETURNS
  const text = await res.text();

  return new Response(text, {
    status: res.status,
    headers: {
      "Content-Type": "text/plain",
      "Access-Control-Allow-Origin": "*"
    }
  });
} 

// /api/img-save  (store binary image into KV)
// ---------------------------------------------------------
if (path === "/api/img-save") {

  // Read raw binary
  const binary = new Uint8Array(await request.arrayBuffer());

  // Extract metadata from headers
  const user = request.headers.get("x-user");
  const pass = request.headers.get("x-pass");
  const filename = request.headers.get("x-filename");

  if (!user || !pass || !filename)
    return json({ error: "Missing user, pass, or filename header" }, 400);

  // Validate password
  const storedPass = await env.Pass.get(user, { type: "text" });
  if (!storedPass)
    return json({ error: "User not found" }, 404);

  if (storedPass !== pass)
    return json({ error: "Incorrect password" }, 403);

  // Store binary directly into KV
  await env.FILES.put(`${user}/${filename}`, binary);

  return json({ success: true });
}



// ---------------------------------------------------------
// /api/code-mon-ai  → OpenRouter single response (KV KEY)
// ---------------------------------------------------------
if (path === "/api/code-mon-ai") {

  let question = "";

  // Accept GET or POST
  if (request.method === "GET") {
    question = url.searchParams.get("question") || "";
  } 
  else if (request.method === "POST") {
    try {
      const body = await request.json();
      question = body.question || "";
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }
  }

  if (!question) {
    return json({ error: "Missing question" }, 400);
  }

  // 🔐 Load OpenRouter API key from KV
  const apiKey = await env.FILES.get("OPENROUTER_KEY", { type: "text" });

  if (!apiKey) {
    return json({ error: "OpenRouter API key not configured" }, 500);
  }

  // 🔒 Single OpenRouter call with reasoning enabled
  const res = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-20b:free",
        messages: [
          {
            role: "user",
            content: question
          }
        ],
        reasoning: { enabled: true }
      })
    }
  );

  if (!res.ok) {
    let err;
    try { err = await res.json(); }
    catch { err = await res.text(); }

    return json({
      error: "OpenRouter error",
      details: err
    }, res.status);
  }

  const data = await res.json();

  const message = data?.choices?.[0]?.message;

  return json({
    answer: message?.content?.trim() || "No response from AI",
    // Optional: include reasoning details if you want them
    reasoning_details: message?.reasoning_details ?? null
  });
}
// ---------------------------------------------------------
// /api/img-deploy  (deploy binary from KV → GitHub)
// ---------------------------------------------------------

if (path === "/api/img-deploy") {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { user, filename } = body;
  if (!user || !filename)
    return json({ error: "Missing user or filename" }, 400);

  // Get binary from KV
  const stored = await env.FILES.get(`${user}/${filename}`, { type: "arrayBuffer" });
  if (!stored)
    return json({ error: "Image not found in KV" }, 404);

  const githubToken = await env.FILES.get("GITHUB_TOKEN", { type: "text" });
  if (!githubToken)
    return json({ error: "GitHub token missing in KV" }, 500);

  const githubApiUrl =
    `https://api.github.com/repos/samadgod569/Code-Mon-space/contents/public/${user}/${filename}`;

  // Check existing file SHA (for updating)
  let fileSha = null;
  try {
    const checkRes = await fetch(githubApiUrl, {
      headers: {
        "Authorization": `Bearer ${githubToken}`,
        "User-Agent": "CodeMon-Image-Deployer"
      }
    });
    if (checkRes.ok) {
      const info = await checkRes.json();
      fileSha = info.sha;
    }
  } catch {}

  // Convert ArrayBuffer → Base64 safely
  function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000; // prevent "call stack exceeded"
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, chunk);
    }
    return btoa(binary);
  }

  const base64 = arrayBufferToBase64(stored);

  const uploadBody = {
    message: `Deploy image ${user}/${filename}`,
    content: base64,
    branch: "main",
    ...(fileSha ? { sha: fileSha } : {})
  };

  const ghRes = await fetch(githubApiUrl, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${githubToken}`,
      "Content-Type": "application/json",
      "User-Agent": "CodeMon-Image-Deployer"
    },
    body: JSON.stringify(uploadBody)
  });

  const text = await ghRes.text();
  let jsonResp;

  try {
    jsonResp = JSON.parse(text);
  } catch {
    return json({ error: "Invalid GitHub JSON", raw: text }, 500);
  }

  if (!ghRes.ok)
    return json({ error: "GitHub error", details: jsonResp }, 500);

  return json({
    success: true,
    url: `https://raw.githubusercontent.com/samadgod569/Code-Mon-space/main/public/${user}/${filename}`,
    github: jsonResp.content?.html_url || null
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
// ------------------------------
// LIST → return all keys for a specific username
// ------------------------------
if (method.toUpperCase() === "LIST") {
  const username = url.searchParams.get("username");

  if (!username) {
    return new Response(JSON.stringify({
      success: false,
      error: "Missing username for LIST method"
    }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders }
    });
  }

  // Fetch ALL keys from KV
  const list = await env.AI.list();

  // Filter keys by prefix: username/
  const filtered = list.keys.filter(k => k.name.startsWith(username + "/"));

  // Load values for each key
  const items = await Promise.all(
    filtered.map(async k => {
      const value = await env.AI.get(k.name, { type: "text" });
      return { 
        key: k.name.replace(username + "/", ""), // return only the key name
        fullKey: k.name,
        value 
      };
    })
  );

  return new Response(JSON.stringify({
    success: true,
    username,
    count: items.length,
    items
  }), {
    headers: { "Content-Type": "application/json", ...corsHeaders }
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
    // ---------------------------
// SAVE FILE (with password check)
// ---------------------------
if (path === "/api/save") {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { user, pass, filename, content } = body;

  if (!user || !pass || !filename) {
    return json({ error: "Missing user, pass or filename" }, 400);
  }

  // Validate password
  const storedPass = await env.Pass.get(user, { type: "text" });

  if (!storedPass)
    return json({ success: false, error: "Username not found" }, 404);

  if (storedPass !== pass)
    return json({ success: false, error: "Incorrect password" }, 403);

  // Save file AFTER password is verified
  await env.FILES.put(`${user}/${filename}`, content ?? "");

  return json({ success: true, message: "File saved successfully" });
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
