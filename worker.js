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

    // APP ORIGIN FOR THE SPACE
    
if (path === "/api/app-list") {
      if (request.method !== "GET") {
        return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
      }

      try {
        let allApps = [];
        let cursor = undefined;

        do {
          const listResult = await env.APP.list({ limit: 1000, cursor });
          allApps.push(...listResult.keys.map(k => k.name));
          cursor = listResult.cursor;
        } while (cursor);

        return new Response(JSON.stringify({ success: true, apps: allApps }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });

      } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message }), {
          status: 500,
          headers: corsHeaders
        });
      }
}
    // ---------------------------------------------------------
// /api/delete-file  → Delete user file securely
// ---------------------------------------------------------
if (path === "/api/delete-file") {

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { username, pass, filename } = body;

  if (!username || !pass || !filename) {
    return json({ error: "username, pass and filename required" }, 400);
  }

  // 🔐 Verify password
  const storedPass = await env.Pass.get(username, { type: "text" });

  if (!storedPass) {
    return json({ error: "User not found" }, 404);
  }

  if (storedPass !== pass) {
    return json({ error: "Incorrect password" }, 403);
  }

  // 🗑 Delete file
  const key = `${username}/${filename}`;
  await env.FILES.delete(key);

  return json({
    success: true,
    message: "File deleted successfully",
    file: key
  });
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

 // pay hai bhai
if (path === "/api/pay") {

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const data = await request.json();
    const { key, username, amount } = data;

    if (!username || amount === undefined)
      return new Response(JSON.stringify({ success: false, error: "Missing fields" }),
        { status: 400, headers: corsHeaders });

    const payAmount = parseInt(amount);
    if (isNaN(payAmount) || payAmount <= 0)
      return new Response(JSON.stringify({ success: false, error: "Invalid amount" }),
        { status: 400, headers: corsHeaders });

    const realKey = await env.FILES.get("KEY");
    if (key !== realKey)
      return new Response(JSON.stringify({ success: false, error: "Invalid key" }),
        { status: 403, headers: corsHeaders });

    const current = await env.PAY.get(username);
    const currentBalance = parseInt(current) || 0;

    const newBalance = currentBalance + payAmount;

    await env.PAY.put(username, newBalance.toString());

    return new Response(JSON.stringify({
      success: true,
      user: username,
      paid: payAmount,
      total: newBalance
    }), {
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });

  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: corsHeaders
    });
  }
           }

    //builder hai bhai
    if (path === "/api/builder") {

  // ---------- GET ----------
  if (request.method === "GET") {
    const name = url.searchParams.get("username");

    if (!name) {
      return new Response("Missing name", {
        status: 400,
        headers: corsHeaders
      });
    }

    const manifest = await env.APP.get(name);

    if (!manifest) {
      return new Response("Not Found", {
        status: 404,
        headers: corsHeaders
      });
    }

    return new Response(manifest, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/manifest+json"
      }
    });
  }

  // ---------- POST ----------
  if (request.method === "POST") {
    let body;

    try {
      body = await request.json();
    } catch {
      return new Response("Invalid JSON", {
        status: 400,
        headers: corsHeaders
      });
    }

    const { name, manifest, username, pass } = body;

    if (!name || !manifest || !username || !pass) {
      return new Response("Missing fields", {
        status: 400,
        headers: corsHeaders
      });
    }

    const storedPass = await env.Pass.get(username);

    if (!storedPass || storedPass !== pass) {
      return new Response("Unauthorized: Invalid credentials", {
        status: 401,
        headers: corsHeaders
      });
    }

    const existing = await env.APP.get(username);

    if (existing) {
      const [owner, storedManifest, description, ...likesArr] = existing.split("*");
      const likes = likesArr.join("*");

      if (owner !== username) {
        return new Response("Forbidden: Not owner", {
          status: 403,
          headers: corsHeaders
        });
      }

      await env.APP.put(
        owner,
        `${owner}*${JSON.stringify(manifest)}*${name || ""}*${likes}`
      );

      return new Response(JSON.stringify({ success: true, updated: true }), {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }

    await env.APP.put(
      username,
      `${username}*${JSON.stringify(manifest)}*${name}*`
    );

    return new Response(JSON.stringify({ success: true, created: true }), {
      status: 201,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }

  return new Response("Method Not Allowed", {
    status: 405,
    headers: corsHeaders
  });
    }

    //like hai bhai
    if (path === "/api/like") {

  if (request.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: corsHeaders
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON", {
      status: 400,
      headers: corsHeaders
    });
  }

  const { username, pass, name } = body;

  if (!username || !pass || !name) {
    return new Response("Missing fields", {
      status: 400,
      headers: corsHeaders
    });
  }

  const storedPass = await env.Pass.get(username);
  if (!storedPass || storedPass !== pass) {
    return new Response("Unauthorized", {
      status: 401,
      headers: corsHeaders
    });
  }

  const appValue = await env.APP.get(name);
  if (!appValue) {
    return new Response("App Not Found", {
      status: 404,
      headers: corsHeaders
    });
  }

  const parts = appValue.split("*");

  const owner = parts[0];
  const manifest = parts[1];
  const description = parts[2];
  let likes = parts.slice(3).join("*");

  let likedUsers = [];

  if (likes && likes.trim() !== "") {
    likedUsers = likes
      .split("[*]")
      .filter(u => u && u.trim() !== "");
  }

  if (likedUsers.includes(username)) {
    return new Response("Already liked", {
      status: 409,
      headers: corsHeaders
    });
  }

  likedUsers.push(username);

  likes = likedUsers.map(u => `${u}[*]`).join("");

  const updatedValue = `${owner}*${manifest}*${description}*${likes}`;

  await env.APP.put(name, updatedValue);

  return new Response(JSON.stringify({
    success: true,
    totalLikes: likedUsers.length,
    likes
  }), {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
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


 if (path === "/api/engine") {

  /* ---------------- CORS ---------------- */
  

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  /* ---------------- SECURITY ---------------- */
  const key = request.headers.get("x-api-key");
  const master = await env.FILES.get("MASTER_KEY", { type: "text" });

  if (!master || key !== master) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 403,
      headers: corsHeaders
    });
  }

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), {
      status: 405,
      headers: corsHeaders
    });
  }

  let body;
  try { body = await request.json(); }
  catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: corsHeaders
    });
  }

  /* ---------------- INPUT ---------------- */
  const { username, key: vmKey } = body;

  if (!username || !vmKey) {
    return new Response(JSON.stringify({ error: "username and key required" }), {
      status: 400,
      headers: corsHeaders
    });
  }

  /* ---------------- LOAD STEPS FROM KV ---------------- */
  const vmRaw = await env.VM.get(`${username}/${vmKey}`, { type: "text" });

  if (!vmRaw) {
    return new Response(JSON.stringify({ error: "VM not found" }), {
      status: 404,
      headers: corsHeaders
    });
  }

  let steps;
  try {
    steps = JSON.parse(vmRaw);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid VM JSON" }), {
      status: 400,
      headers: corsHeaders
    });
  }

  if (!Array.isArray(steps)) {
    return new Response(JSON.stringify({ error: "VM must contain steps[]" }), {
      status: 400,
      headers: corsHeaders
    });
  }

  /* ---------------- STATE ---------------- */
  const state = structuredClone(body.input ?? {});
  const logs = [];

  /* ---------------- HELPERS ---------------- */
  const get = (obj, path) =>
    path.split(".").reduce((o, k) => o?.[k], obj);

  const set = (obj, path, val) => {
    const keys = path.split(".");
    let cur = obj;
    while (keys.length > 1) {
      const k = keys.shift();
      cur[k] ??= {};
      cur = cur[k];
    }
    cur[keys[0]] = val;
  };

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  /* ---------------- OPS ---------------- */
  const OPS = {

    /* ---- BASIC ---- */
    set({ path, value }) { set(state, path, value); },
    log({ msg }) { logs.push(String(msg)); },
    warn({ msg }) { logs.push("WARN: " + msg); },
    error({ msg }) { throw new Error(msg); },

    return({ value }) { throw { __return: value }; },
    noop() {},

    clone({ from, into }) {
      set(state, into, structuredClone(get(state, from)));
    },

    default({ path, value }) {
      const v = get(state, path);
      if (v === undefined || v === null || v === "") {
        set(state, path, value);
      }
    },

    assert({ condition, msg }) {
      if (!get(state, condition)) {
        throw new Error(msg || "Assertion failed");
      }
    },

    /* ---- STRING ---- */
    trim({ from, into }) {
      set(state, into, String(get(state, from)).trim());
    },
    uppercase({ from, into }) {
      set(state, into, String(get(state, from)).toUpperCase());
    },
    lowercase({ from, into }) {
      set(state, into, String(get(state, from)).toLowerCase());
    },
    replace({ from, search, value, into }) {
      set(state, into, String(get(state, from)).split(search).join(value));
    },
    split({ from, sep, into }) {
      set(state, into, String(get(state, from)).split(sep));
    },
    concat({ into, values }) {
      set(state, into, values.map(v => get(state, v) ?? v).join(""));
    },
    length({ from, into }) {
      set(state, into, String(get(state, from)).length);
    },
    template({ text, into }) {
      set(state, into,
        text.replace(/\{\{(.*?)\}\}/g, (_, p) => get(state, p.trim()) ?? "")
      );
    },

    /* ---- CHECKS ---- */
    equals({ a, b, into }) {
      set(state, into, get(state, a) === get(state, b));
    },
    is_uppercase({ from, into }) {
      const v = String(get(state, from));
      set(state, into, v === v.toUpperCase());
    },
    is_lowercase({ from, into }) {
      const v = String(get(state, from));
      set(state, into, v === v.toLowerCase());
    },

    /* ---- MATH ---- */
    add({ a, b, into }) {
      set(state, into, Number(get(state, a)) + Number(get(state, b)));
    },
    multiply({ a, b, into }) {
      set(state, into, Number(get(state, a)) * Number(get(state, b)));
    },

    /* ---- CONDITIONS ---- */
    if_greater: async ({ a, b, then = [], else: other = [] }) =>
      await run(Number(get(state, a)) > Number(get(state, b)) ? then : other),

    /* ---- SAFE EXPRESSION ---- */
    expr({ expr, into }) {
      const blocked = /(constructor|function|=>|this|global|window|eval|new)/;
      if (blocked.test(expr)) throw new Error("Unsafe expression");

      const vars = Object.keys(state);
      const fn = new Function(...vars, `return (${expr})`);
      set(state, into, fn(...vars.map(k => state[k])));
    },

    /* ---- NETWORK ---- */
    fetch: async ({ url, method = "GET", headers = {}, body, into, json }) => {
      const res = await fetch(get(state, url) ?? url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined
      });
      set(state, into, json ? await res.json() : await res.text());
    },

    /* ---- TIMING ---- */
    sleep: async ({ ms }) => await sleep(ms),

    /* ================= KV OPS ================= */

    kv_check: async ({ username, key, value, into }) => {
      if (!username || !key || !value) {
        set(state, into, { success: false, error: "Missing username, key or value" });
        return;
      }
      const stored = await env.PRO.get(`${username}/${key}`, { type: "text" });
      set(state, into, stored ? { success: stored === value } : { success: false, error: "Key not found" });
    },

    kv_auth: async ({ username, pass, into }) => {
      const stored = await env.Pass.get(username, { type: "text" });
      if (!stored) return set(state, into, { success: false, error: "Username not found" });
      set(state, into, { success: stored === pass });
    },

    kv_write_read: async ({ username, method, name, value, into }) => {
      if (method === "POST") {
        await env.API.put(`${username}/${name}`, value);
        set(state, into, { success: true });
      } else {
        const v = await env.API.get(`${username}/${name}`, { type: "text" });
        set(state, into, { success: v !== null, value: v });
      }
    }
  };

  /* ---------------- EXECUTOR ---------------- */
  const run = async steps => {
    for (const step of steps) {
      const fn = OPS[step.op];
      if (!fn) throw new Error(`Unknown op: ${step.op}`);
      await fn(step);
    }
  };

  /* ---------------- RUN ---------------- */
  try {
    await run(steps);
    return new Response(JSON.stringify({ success: true, state, logs }), { headers: corsHeaders });
  } catch (e) {
    if (e?.__return !== undefined) {
      return new Response(JSON.stringify({ success: true, result: e.__return, state, logs }), { headers: corsHeaders });
    }
    return new Response(JSON.stringify({ success: false, error: String(e), logs }), { status: 500, headers: corsHeaders });
  }
      }  
    // ---------------------------------------------------------
// /api/engine-add → Securely add/update VM steps
// ---------------------------------------------------------
if (path === "/api/engine-add") {

  /* ---------------- CORS ---------------- */
  

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), {
      status: 405,
      headers: corsHeaders
    });
  }

  /* ---------------- BODY ---------------- */
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: corsHeaders
    });
  }

  const { username, pass, key, steps } = body;

  if (!username || !pass || !key || !Array.isArray(steps)) {
    return new Response(JSON.stringify({
      error: "username, pass, key and steps[] required"
    }), {
      status: 400,
      headers: corsHeaders
    });
  }

  /* ---------------- AUTH ---------------- */
  const storedPass = await env.Pass.get(username, { type: "text" });

  if (!storedPass) {
    return new Response(JSON.stringify({
      success: false,
      error: "Username not found"
    }), {
      status: 404,
      headers: corsHeaders
    });
  }

  if (storedPass !== pass) {
    return new Response(JSON.stringify({
      success: false,
      error: "Incorrect password"
    }), {
      status: 403,
      headers: corsHeaders
    });
  }

  /* ---------------- STORE VM ---------------- */
  await env.VM.put(
    `${username}/${key}`,
    JSON.stringify(steps)
  );

  return new Response(JSON.stringify({
    success: true,
    message: "VM saved successfully",
    vm: `${username}/${key}`,
    stepCount: steps.length
  }), {
    headers: corsHeaders
  });
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
question = question + "MAIN: YOU ARE AN CODE MON AI REMEMBER THIS";
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
const filename = "manifest.json";
      const { user } = body;
      if (!user || !filename)
        return json({ error: "Missing params" }, 400);

      const stored = await env.FILES.get(`${user}/${filename}`, { type: "text" });

      if (!stored)
        return json({ error: "File not found" }, 404);

      

      const githubToken = await env.FILES.get("GITHUB_TOKEN", { type: "text" });

      if (!githubToken)
        return json({ error: "GitHub token missing in KV" }, 500);
const real = `${user}_${filename}`;
      const githubApiUrl = `https://api.github.com/repos/samadgod569/Code-Mon-space/contents/public/${real}`;

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
        message: `Deploy ${real}`,
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
        url: `https://code-mon.codemon.workers.dev/public/${real}`,
        github: ghJson.content?.html_url ?? null
      });
    }

    // ---------------------------
    // DEFAULT
    // ---------------------------
    return new Response("Worker Online", { headers: corsHeaders });
  }
};
