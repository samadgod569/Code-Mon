export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // ---------------------------
    // CORS
    // ---------------------------

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
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



    if (path === "/api/agent") {
  let question = "";
  let modelKey = "gpt-oss";
  let username = "";
  let password = "";

  const MODEL_CONFIG = {
    "gpt-oss": { model: "openai/gpt-oss-20b" },
    "gpt-oss-120b": { model: "openai/gpt-oss-120b" },
    "gpt-2.1": { model: "openai/gpt-2.1-chat" },
    "gemma-27b": { model: "google/gemma-3-27b-it" },
    "qwen-next-80b": { model: "qwen/qwen3-next-80b-a3b-instruct" },
    "qwen-coder": { model: "qwen/qwen3-coder" },
    "glm-4.5-air": { model: "z-ai/glm-4.5-air" },
    "code-mon-special": { model: "openrouter/free" },
    "step-3.5": { model: "stepfun/step-3.5-flash"},
    "trinity": { model: "arcee-ai/trinity-large-preview"},
    "nemotron": { model: "nvidia/nemotron-3-nano-30b-a3b"},

    "qwen-235b": { model: "qwen/qwen3-235b-a22b-thinking-2507" },
    "o3-mini": { model: "openai/o3-mini" },
    "gpt-4.1": { model: "openai/gpt-4.1" },
    "gpt-4o": { model: "openai/gpt-4o" },
    "gpt-5.2": { model: "openai/gpt-5.2" },
    "gpt-5.3-codex": { model: "openai/gpt-5.3-codex" },

    "sonnet": { model: "anthropic/claude-3.5-sonnet" },
    "sonnet-4.6": { model: "anthropic/claude-sonnet-4.6" },
    "haiku": { model: "anthropic/claude-3.5-haiku" },
    "opus-4.6": { model: "anthropic/claude-opus-4-6" },

    "llama-70b": { model: "meta-llama/llama-3.1-70b-instruct" },
    "nano-banana": { model: "google/gemini-3.1-flash-image-preview"},
    "gemini-3.1-pro": { model: "google/gemini-3.1-pro-preview-customtools"},
    "grok-4.1": { model:"x-ai/grok-4.1-fast"},
    "grok-4.0": { model: "x-ai/grok-4-fast"},
    "llama-4": { model: "meta-llama/llama-4-maverick"},
    "llama-4-scout": { model: "meta-llama/llama-4-scout"},
    "deepseek-3.1": { model: "nex-agi/deepseek-v3.1-nex-n1" },
    "deepseek-3.2-special": { model: "deepseek/deepseek-v3.2-speciale" },
    "deepseek-3.2": { model: "deepseek/deepseek-v3.2"},
    "grok-code": { model: "x-ai/grok-code-fast-1"},
    "mistral-8b-2512": { model: "mistralai/ministral-8b-2512"},
    "mistral-14b-2512": { model: "mistralai/ministral-14b-2512"},
    "mistral-code": { model: "mistralai/codestral-2508"}
  };

  if (request.method === "GET") {
    question = url.searchParams.get("question") || "";
    modelKey = url.searchParams.get("model") || modelKey;
    username = url.searchParams.get("username") || "";
    password = url.searchParams.get("password") || "";
  } else if (request.method === "POST") {
    try {
      const body = await request.json();
      question = body.question || "";
      modelKey = body.model || modelKey;
      username = body.username || "";
      password = body.password || "";
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
  }

  if (!question) {
    return new Response(JSON.stringify({ error: "Missing question" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  if (!username || !password) {
    return new Response(JSON.stringify({ error: "Missing username or password" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  const storedPassword = await env.Pass.get(username);

  if (!storedPassword || storedPassword !== password) {
    return new Response(JSON.stringify({ error: "Invalid credentials" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  const balanceRaw = await env.PAY.get(username);
  const balance = Number(balanceRaw);

  if (!balanceRaw || isNaN(balance)) {
    return new Response(JSON.stringify({ error: "Balance not found" }), {
      status: 402,
      headers: { "Content-Type": "application/json" }
    });
  }

  if (balance < 4) {
    return new Response(JSON.stringify({ error: "Insufficient balance" }), {
      status: 402,
      headers: { "Content-Type": "application/json" }
    });
  }

  const newBalance = balance - 4;
  await env.PAY.put(username, String(newBalance));

  const cfg = MODEL_CONFIG[modelKey];

  if (!cfg) {
    return new Response(JSON.stringify({
      error: "Invalid model",
      allowed: Object.keys(MODEL_CONFIG)
    }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  const apiKey = await env.FILES.get("OPRT");

  if (!apiKey) {
    return new Response(JSON.stringify({ error: "Bytez API key missing" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  const requestBody = {
    messages: [
      { role: "user", content: question }
    ],
    params: {
      max_tokens: 128000
    }
  };

  try {
    const res = await fetch(`https://api.bytez.com/models/v2/${cfg.model}`, {
      method: "POST",
      headers: {
        "Authorization": apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody)
    });

    return new Response(res.body, {
      status: res.status,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store"
      }
    });

  } catch (e) {
    return new Response(JSON.stringify({
      error: "Bytez request failed",
      details: e.message
    }), {
      status: 502,
      headers: { "Content-Type": "application/json" }
    });
  }
    }

if (path === "/api/game") {


  if (request.method === "POST") {
    let body;

    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const { username, pass, game, type, project, starting } = body;

    if (!username || !pass || !game || !type || !project || starting === undefined)
      return json({ error: "Missing required fields" }, 400);

    const storedPass = await env.Pass.get(username, { type: "text" });

    if (!storedPass)
      return json({ error: "User not found" }, 404);

    if (storedPass !== pass)
      return json({ error: "Incorrect password" }, 403);

    const gameKey = `game/${username}/${game}`;

    
    const existingGame = await env.STORAGE.get(gameKey);
    if (existingGame)
      return json({ error: "Game already exists" }, 409);

    const payRaw = await env.PAY.get(username, { type: "text" });
    const balance = Number(payRaw ?? 0);

    if (balance < 50)
      return json({ error: "Insufficient balance" }, 402);

    await env.PAY.put(username, String(balance - 50));

    const gameData = {
      type: type,
      project: project,
      starting: starting
    };

    await env.STORAGE.put(gameKey, JSON.stringify(gameData));

    return json({
      success: true,
      message: "Game created successfully (50 shells charged)"
    });
  }


  if (request.method === "GET") {
    const username = url.searchParams.get("user");
    const game = url.searchParams.get("game");

    if (!username || !game)
      return json({ error: "Missing user or game" }, 400);

    const gameKey = `game/${username}/${game}`;
    const gameData = await env.STORAGE.get(gameKey, { type: "json" });

    if (!gameData)
      return json({ error: "Game not found" }, 404);

    return json(gameData);
  }
}

    
    if (path === "/api/list-dir") {
  const user = url.searchParams.get("user");
  const dir = url.searchParams.get("dir");

  if (!user || dir === null)
    return json({ error: "Missing user or dir" }, 400);

  let prefix;

  if (dir === "/" || dir === "") {
    prefix = `${user}/`;
  } else {
    const tree = dir.replace(/^\/+|\/+$/g, ""); 
    prefix = `${user}/${tree}/`;
  }

  const list = await env.FILES.list({ prefix });

  return json({
    files: list.keys.map(k =>
      k.name.replace(`${user}/`, "")
    )
  });
    }

if (path === "/api/agents") {
  let question = "";
  let modelKey = "gpt-oss";
let username = "";
let password = "";
  const MODEL_CONFIG = {
    "gpt-oss": { model: "openai/gpt-oss-20b:free", free: true },
    "gpt-oss-120b": { model: "openai/gpt-oss-120b:free", free: true },
    "gpt-2.1": { model: "openai/gpt-2.1-chat:free", free: true },
    "gemma-27b": { model: "google/gemma-3-27b-it:free", free: true },
    "qwen-next-80b": { model: "qwen/qwen3-next-80b-a3b-instruct:free", free: true },
    "qwen-coder": { model: "qwen/qwen3-coder:free", free: true },
    "glm-4.5-air": { model: "z-ai/glm-4.5-air:free", free: true },
    "code-mon-special": { model: "openrouter/free", free: true },
    "step-3.5": { model: "stepfun/step-3.5-flash:free", free: true},
    "trinity": { model: "arcee-ai/trinity-large-preview:free", free: true},
    "nemotron": { model: "nvidia/nemotron-3-nano-30b-a3b:free", free: true},

    "qwen-235b": { model: "qwen/qwen3-235b-a22b-thinking-2507", free: false, max_tokens: 15000 },
    "o3-mini": { model: "openai/o3-mini", free: false, max_tokens: 2000 },
    "gpt-4.1": { model: "openai/gpt-4.1", free: false, max_tokens: 1000 },
    "gpt-4o": { model: "openai/gpt-4o", free: false, max_tokens: 1200 },
    "gpt-5.2": { model: "openai/gpt-5.2", free: false, max_tokens: 1400 },
    "gpt-5.3-codex": { model: "openai/gpt-5.3-codex", free: false, max_tokens: 1400 },

    "sonnet": { model: "anthropic/claude-3.5-sonnet", free: false, max_tokens: 300 },
    "sonnet-4.6": { model: "anthropic/claude-sonnet-4.6", free: false, max_tokens: 350 },
    "haiku": { model: "anthropic/claude-3.5-haiku", free: false, max_tokens: 2000 },
    "opus-4.6": { model: "anthropic/claude-opus-4.6", free: false, max_tokens: 300},

    "llama-70b": { model: "meta-llama/llama-3.1-70b-instruct", free: false, max_tokens: 32000 },
    "nano-banana": { model: "google/gemini-3.1-flash-image-preview", free: false, max_tokens: 3000},
    "gemini-3.1-pro": { model: "google/gemini-3.1-pro-preview-customtools", free: false, max_tokens: 700},
    "grok-4.1": { model:"x-ai/grok-4.1-fast", free: false, max_tokens: 30000},
    "grok-4.0": { model: "x-ai/grok-4-fast", free: false, max_tokens: 30000},
    "llama-4": { model: "meta-llama/llama-4-maverick", free: false, max_tokens: 15000},
    "llama-4-scout": { model: "meta-llama/llama-4-scout", free: false, max_tokens: 15000},
    "deepseek-3.1": { model: "nex-agi/deepseek-v3.1-nex-n1", free: false, max_tokens: 30000 },
    "deepseek-3.2-special": { model: "deepseek/deepseek-v3.2-speciale", free: false, max_tokens: 30000 },
    "deepseek-3.2": { model: "deepseek/deepseek-v3.2", free: false, max_tokens: 30000},
    "grok-code": { model: "x-ai/grok-code-fast-1", free: false, max_tokens: 30000},
    "mistral-8b-2512": { model: "mistralai/ministral-8b-2512", free: false, max_tokens: 30000},
    "mistral-14b-2512": { model: "mistralai/ministral-14b-2512", free: false, max_tokens: 30000},
    "mistral-code": { model: "mistralai/codestral-2508", free: false, max_tokens: 30000}
  };

  if (request.method === "GET") {
  question = url.searchParams.get("question") || "";
  modelKey = url.searchParams.get("model") || modelKey;
  username = url.searchParams.get("username") || "";
  password = url.searchParams.get("password") || "";
  }else if (request.method === "POST") {
  try {
    const body = await request.json();
    question = body.question || "";
    modelKey = body.model || modelKey;
    username = body.username || "";
    password = body.password || "";
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }
  }

  if (!question) {
    return new Response(JSON.stringify({ error: "Missing question" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }
  if (!username || !password) {
  return new Response(JSON.stringify({ error: "Missing username or password" }), {
    status: 401,
    headers: { "Content-Type": "application/json" }
  });
  }
  const storedPassword = await env.Pass.get(username);

if (!storedPassword || storedPassword !== password) {
  return new Response(JSON.stringify({ error: "Invalid credentials" }), {
    status: 401,
    headers: { "Content-Type": "application/json" }
  });
}
  const balanceRaw = await env.PAY.get(username);
const balance = Number(balanceRaw);

if (!balanceRaw || isNaN(balance)) {
  return new Response(JSON.stringify({ error: "Balance not found" }), {
    status: 402,
    headers: { "Content-Type": "application/json" }
  });
}

if (balance < 4) {
  return new Response(JSON.stringify({ error: "Insufficient balance" }), {
    status: 402,
    headers: { "Content-Type": "application/json" }
  });
}

// deduct 4 credits
const newBalance = balance - 4;
await env.PAY.put(username, String(newBalance));

  const cfg = MODEL_CONFIG[modelKey];
  if (!cfg) {
    return new Response(JSON.stringify({
      error: "Invalid model",
      allowed: Object.keys(MODEL_CONFIG)
    }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  const keys = await env.FILES.get("OPR", { type: "json" });
  if (!Array.isArray(keys) || keys.length === 0) {
    return new Response(JSON.stringify({ error: "OP keys missing or invalid" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  let lastError = null;

  for (const apiKey of keys) {
    const requestBody = {
      model: cfg.model,
      messages: [{ role: "user", content: question }]
    };

    if (!cfg.free) {
      requestBody.max_tokens = cfg.max_tokens;
    }

    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestBody)
      });

      if (res.ok) {
        return new Response(res.body, {
          status: res.status,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-store"
          }
        });
      }

      lastError = await res.text();
    } catch (e) {
      lastError = e.message;
    }
  }

  return new Response(JSON.stringify({
    error: "All API keys failed",
    details: lastError
  }), {
    status: 502,
    headers: { "Content-Type": "application/json" }
  });
}


if (path === "/api/img-save-org") {
  const binary = new Uint8Array(await request.arrayBuffer());

  const username = request.headers.get("x-user");
  const pass = request.headers.get("x-pass");
  const orgName = request.headers.get("x-org");
  const filename = request.headers.get("x-filename");

  if (!username || !pass || !orgName || !filename)
    return json({ error: "Missing headers" }, 400);

  const storedPass = await env.Pass.get(username, { type: "text" });

  if (!storedPass)
    return json({ error: "User not found" }, 404);

  if (storedPass !== pass)
    return json({ error: "Incorrect password" }, 403);

  const orgKey = `org/set/${orgName}`;
  const orgData = await env.STORAGE.get(orgKey, { type: "json" });

  if (!orgData)
    return json({ error: "Organization not found" }, 404);

  const isOwner = orgData.owner === username;
  const isMember =
    Array.isArray(orgData.members) && orgData.members.includes(username);

  if (!isOwner && !isMember)
    return json({ error: "You are not a member of this organization" }, 403);

  const fileKey = `${orgName}/${filename}`;
  const existingFile = await env.FILES.get(fileKey);

  if (!existingFile) {
    const payRaw = await env.PAY.get(username, { type: "text" });
    const pay = Number(payRaw ?? 0);

    if (pay < 10)
      return json({ error: "Insufficient balance" }, 402);

    await env.PAY.put(username, String(pay - 10));
  }

  await env.FILES.put(fileKey, binary);

  
  const d = new Date();
  const date =
    `${d.getDate()}-${d.getMonth() + 1}-${String(d.getFullYear()).slice(2)}`;

  if (!Array.isArray(orgData.blame)) orgData.blame = [];
  if (orgData.blame.length >= 20) orgData.blame.pop();

  orgData.blame.unshift(
    `${username} uploaded ${filename}[*]${date}`
  );

  await env.STORAGE.put(orgKey, JSON.stringify(orgData));

  return json({ success: true });
}

if (path === "/api/delete-org-file") {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { username, pass, orgName, filename } = body;

  if (!username || !pass || !orgName || !filename) {
    return json(
      { error: "username, pass, orgName and filename required" },
      400
    );
  }

  const storedPass = await env.Pass.get(username, { type: "text" });

  if (!storedPass)
    return json({ error: "User not found" }, 404);

  if (storedPass !== pass)
    return json({ error: "Incorrect password" }, 403);

  const orgKey = `org/set/${orgName}`;
  const orgData = await env.STORAGE.get(orgKey, { type: "json" });

  if (!orgData)
    return json({ error: "Organization not found" }, 404);

  const isOwner = orgData.owner === username;
  const isMember =
    Array.isArray(orgData.members) && orgData.members.includes(username);

  if (!isOwner && !isMember)
    return json(
      { error: "You are not a member of this organization" },
      403
    );

  const fileKey = `${orgName}/${filename}`;
  await env.FILES.delete(fileKey);

  
  const d = new Date();
  const date =
    `${d.getDate()}-${d.getMonth() + 1}-${String(d.getFullYear()).slice(2)}`;

  if (!Array.isArray(orgData.blame)) orgData.blame = [];
  if (orgData.blame.length >= 20) orgData.blame.pop();

  orgData.blame.unshift(
    `${username} deleted ${filename}[*]${date}`
  );

  await env.STORAGE.put(orgKey, JSON.stringify(orgData));

  return json({
    success: true,
    message: "File deleted successfully",
    file: fileKey
  });
}
    

if (path === "/api/list-org") {
  const user = url.searchParams.get("user");
  const orgName = url.searchParams.get("orgName");

  if (!user || !orgName)
    return json({ error: "Missing user or orgName" }, 400);

  const orgKey = `org/set/${orgName}`;
  const orgData = await env.STORAGE.get(orgKey, { type: "json" });

  if (!orgData)
    return json({ error: "Organization not found" }, 404);

  if (orgData.type === "private") {
    const isOwner = orgData.owner === user;
    const isMember =
      Array.isArray(orgData.members) && orgData.members.includes(user);

    if (!isOwner && !isMember)
      return json({ error: "Organization is private" }, 403);
  }

  const list = await env.FILES.list({ prefix: `${orgName}/` });

  return json({
    files: list.keys.map(k => k.name.replace(`${orgName}/`, ""))
  });
}

if (path === "/api/load-org") {
  const user = url.searchParams.get("user");
  const orgName = url.searchParams.get("orgName");
  const filename = url.searchParams.get("filename");

  if (!user || !orgName || !filename)
    return json({ error: "Missing params" }, 400);

  const orgKey = `org/set/${orgName}`;
  const orgData = await env.STORAGE.get(orgKey, { type: "json" });

  if (!orgData)
    return json({ error: "Organization not found" }, 404);

  if (orgData.type === "private") {
    const isOwner = orgData.owner === user;
    const isMember =
      Array.isArray(orgData.members) && orgData.members.includes(user);

    if (!isOwner && !isMember)
      return json({ error: "Organization is private" }, 403);
  }

  const stored = await env.FILES.get(`${orgName}/${filename}`, { type: "text" });

  return new Response(stored || "", {
    headers: {
      "Content-Type": "text/plain",
      ...corsHeaders
    }
  });
        }

    
if (path === "/api/save-org") {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { user, pass, orgName, filename, content } = body;

  if (!user || !pass || !orgName || !filename) {
    return json(
      { error: "Missing user, pass, orgName or filename" },
      400
    );
  }

  const storedPass = await env.Pass.get(user, { type: "text" });

  if (!storedPass)
    return json({ error: "Username not found" }, 404);

  if (storedPass !== pass)
    return json({ error: "Incorrect password" }, 403);

  const orgKey = `org/set/${orgName}`;
  const orgData = await env.STORAGE.get(orgKey, { type: "json" });

  if (!orgData)
    return json({ error: "Organization not found" }, 404);

  const isOwner = orgData.owner === user;
  const isMember = Array.isArray(orgData.members) && orgData.members.includes(user);

  if (!isOwner && !isMember)
    return json({ error: "You are not a member of this organization" }, 403);

  const fileKey = `${orgName}/${filename}`;
  const existingFile = await env.FILES.get(fileKey);

  if (!existingFile) {
    const current = await env.PAY.get(user);
    const balance = parseInt(current) || 0;

    if (balance < 5) {
      return json(
        { error: "Insufficient balance" },
        402
      );
    }

    await env.PAY.put(user, String(balance - 5));
  }

  await env.FILES.put(fileKey, content ?? "");

  

const d = new Date();
const date =
  `${d.getDate()}-${d.getMonth() + 1}-${String(d.getFullYear()).slice(2)}`;

const text = existingFile
  ? `${user} updated ${filename}[*]${date}`
  : `${user} created ${filename}[*]${date}`;

if (!Array.isArray(orgData.blame))
  orgData.blame = [];

if (orgData.blame.length >= 20)
  orgData.blame.pop();

orgData.blame.unshift(text);

await env.STORAGE.put(orgKey, JSON.stringify(orgData));
  
  return json({
    success: true,
    message: existingFile
      ? "File updated successfully"
      : "File created successfully (5 credits charged)"
  });
}

    
if (path === "/api/org/inv") {
  const username = url.searchParams.get("username");

  if (!username) {
    return json(
      { error: "Missing username" },
      400
    );
  }

  const invKey = `org/inv/${username}`;
  const inv = await env.STORAGE.get(invKey, { type: "json" });

  return json({
    success: true,
    orgs: Array.isArray(inv) ? inv : []
  });
}
    

if (path === "/api/org-img") {

  /* =========================
     GET ORG IMAGE
  ========================== */
  if (request.method === "GET") {
    const orgName = url.searchParams.get("orgName");

    if (!orgName)
      return json({ error: "Missing orgName" }, 400);

    const imgKey = `org/img/${orgName}`;
    const img = await env.STORAGE.get(imgKey, { type: "arrayBuffer" });

    if (!img)
      return json({ error: "Image not found" }, 404);

    return new Response(img, {
      headers: {
        "Content-Type": "image/*",
        "Cache-Control": "public, max-age=86400"
      }
    });
  }

  /* =========================
     UPLOAD ORG IMAGE
  ========================== */
  if (request.method === "POST") {
    const binary = new Uint8Array(await request.arrayBuffer());

    const user = request.headers.get("x-user");
    const pass = request.headers.get("x-pass");
    const orgName = request.headers.get("x-org");

    if (!user || !pass || !orgName)
      return json(
        { error: "Missing user, pass, or org header" },
        400
      );

    const storedPass = await env.Pass.get(user, { type: "text" });
    if (!storedPass)
      return json({ error: "User not found" }, 404);

    if (storedPass !== pass)
      return json({ error: "Incorrect password" }, 403);

    const orgKey = `org/set/${orgName}`;
    const orgData = await env.STORAGE.get(orgKey, { type: "json" });

    if (!orgData)
      return json({ error: "Organization not found" }, 404);

    if (orgData.owner !== user)
      return json(
        { error: "Only owner can upload org image" },
        403
      );

    const imgKey = `org/img/${orgName}`;
    await env.STORAGE.put(imgKey, binary);

    return json({
      success: true,
      message: "Organization image uploaded"
    });
  }

  return json({ error: "Method not allowed" }, 405);
}
    
if (path === "/api/org") {

  /* =========================
     CREATE ORG (POST)
  ========================== */
  if (request.method === "POST") {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }

    const { user, pass, orgName, type } = body;

    if (!user || !pass || !orgName || !type) {
      return json(
        { error: "Missing user, pass, orgName or type" },
        400
      );
    }

    // orgName validation
    if (!/^[a-zA-Z0-9]{6,12}$/.test(orgName)) {
      return json(
        { error: "orgName must be 6-12 chars, letters & numbers only" },
        400
      );
    }

    if (type !== "public" && type !== "private") {
      return json(
        { error: "Type must be either public or private" },
        400
      );
    }

    const storedPass = await env.Pass.get(user, { type: "text" });

    if (!storedPass)
      return json({ error: "Username not found" }, 404);

    if (storedPass !== pass)
      return json({ error: "Incorrect password" }, 403);

    const currentBalance = await env.PAY.get(user);
    const balance = parseInt(currentBalance) || 0;

    if (balance < 50)
      return json({ error: "Insufficient balance" }, 402);

    await env.PAY.put(user, String(balance - 50));

    const orgData = {
      name: orgName,
      members: [],
      owner: user,
      blame: [],
      type: type
    };

    // save org data
    const orgKey = `org/set/${orgName}`;
    await env.STORAGE.put(orgKey, JSON.stringify(orgData));

    /* =========================
       UPDATE USER ORG INDEX
    ========================== */
    const invKey = `org/inv/${user}`;
    const existingInv = await env.STORAGE.get(invKey, { type: "json" });

    let invArray = [];

    if (Array.isArray(existingInv)) {
      invArray = existingInv;
      if (!invArray.includes(orgName)) {
        invArray.push(orgName);
      }
    } else {
      invArray = [orgName];
    }

    await env.STORAGE.put(invKey, JSON.stringify(invArray));

    /* =========================
       CREATE ORG PASSWORD
    ========================== */
    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let orgPass = "";
    for (let i = 0; i < 20; i++) {
      orgPass += chars[Math.floor(Math.random() * chars.length)];
    }

    // store org password in Pass KV
    await env.Pass.put(orgName, orgPass);

    return json({
      success: true,
      message: "Organization created successfully (50 shells charged)",
      org: orgData
    });
  }

  /* =========================
     GET ORG (GET)
  ========================== */
  if (request.method === "GET") {
    const orgName = url.searchParams.get("orgName");

    if (!orgName)
      return json({ error: "Missing orgName" }, 400);

    const orgKey = `org/set/${orgName}`;
    const orgData = await env.STORAGE.get(orgKey, { type: "json" });

    if (!orgData)
      return json({ error: "Organization not found" }, 404);

    return json({
      success: true,
      org: orgData
    });
  }

  return json({ error: "Method not allowed" }, 405);
        }
    
// ---------------------------------------------------------
// /api/unverify → Register domain (NO verification)
// ---------------------------------------------------------
if (path === "/api/unverify") {

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ error: "POST only" }, 405);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { domain, cdomain } = body;

  if (!domain || !cdomain) {
    return json({ error: "domain and cdomain are required" }, 400);
  }

  // Normalize domain
  const cleanDomain = domain.toLowerCase().trim();

  // KV key
  const kvKey = `domain/unv/${cleanDomain}`;



  // Store as unverified
  const value = {
    target: cdomain,
    verify: false
  };

  await env.STORAGE.put(kvKey, JSON.stringify(value));

  // Return DNS instructions
  return json({
    Name: `_codemon.${cleanDomain}`,
    Target: "verify.code-mon-space.shop"
  });
}
    
    // VERIFIED

    if (path === "/api/verify") {

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ error: "POST only" }, 405);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { domain } = body;

  if (!domain) {
    return json({ error: "domain is required" }, 400);
  }

  const cleanDomain = domain.toLowerCase().trim();
  const unvKey = `domain/unv/${cleanDomain}`;

  const stored = await env.STORAGE.get(unvKey, { type: "json" });
  if (!stored) {
    return json({ error: "Domain not found or already verified" }, 404);
  }

  const dnsURL =
    `https://cloudflare-dns.com/dns-query?name=_codemon.${cleanDomain}&type=CNAME`;

  const res = await fetch(dnsURL, {
    headers: { "Accept": "application/dns-json" }
  });

  if (!res.ok) {
    return json({ error: "DNS lookup failed" }, 502);
  }

  const data = await res.json();

  const verified =
    data.Answer &&
    data.Answer.some(
      a => a.data.replace(/\.$/, "") === "verify.code-mon-space.shop"
    );

  if (!verified) {
    return json({ error: "Domain not verified yet" }, 403);
  }

  const newValue = {
    target: stored.target,
    verify: true
  };

  await env.STORAGE.delete(unvKey);
  await env.STORAGE.put(
    `domain/v/${cleanDomain}`,
    JSON.stringify(newValue)
  );

  return json({
    Name: cleanDomain,
    Target: stored.target
  });
  }
    
// ---------------------------------------------------------
// /api/external  → Verify GitHub Pages ownership (Code-Mon)
// ---------------------------------------------------------
if (path === "/api/external") {

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return new Response("POST only", {
      status: 405,
      headers: corsHeaders
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { token, repo, type, username, pass } = body;

  if (!token || !repo || !type || !username || !pass) {
    return json({ error: "Missing required fields" }, 400);
  }

  // 🔐 Verify CodeMon credentials
  const storedPass = await env.Pass.get(username, { type: "text" });
  if (!storedPass) {
    return json({ error: "User not found" }, 404);
  }

  if (storedPass !== pass) {
    return json({ error: "Incorrect password" }, 403);
  }

  // 🧠 Parse repo
  const parts = repo.split("/");
  if (parts.length !== 2) {
    return json({ error: "Invalid repo format" }, 400);
  }

  let owner = parts[0].toLowerCase();
  const repoName = parts[1];

  // 🌍 Build GitHub Pages URLs
let fetchURL;
let storeURL;

if (type === "single") {
  fetchURL = `https://${owner}.github.io/${repoName}/`;
  storeURL = `https://${owner}.github.io/${repoName}`;
} else if (type === "org") {
  fetchURL = `https://${owner}.github.io/${repoName}/`;
  storeURL = `https://${owner}.github.io/${repoName}`;
} else {
  return json({ error: "type must be 'single' or 'org'" }, 400);
}

// 🌐 Fetch homepage (WITH slash)
let html;
try {
  const resp = await fetch(fetchURL);
  if (!resp.ok) {
    return json({ error: "Failed to fetch GitHub Pages site" }, 502);
  }
  html = await resp.text();
} catch {
  return json({ error: "Fetch error" }, 502);
}

// 🔍 Verify meta tag
const metaRegex =
  /<meta\s+name=["']Code-Mon["']\s+content=["']([^"']+)["']/i;
const match = html.match(metaRegex);

if (!match || match[1] !== token) {
  return json({ error: "Ownership verification failed" }, 403);
}

// 📦 Check existing configuration
const storageKey = `website/git/${owner}`;
const exists = await env.STORAGE.get(storageKey);

if (exists) {
  return json({ error: "Website already configured" }, 409);
}

// 📝 Save configuration (NO slash)
const data = {
  owner: username,
  url: storeURL,
  domain: ""
};

await env.STORAGE.put(storageKey, JSON.stringify(data));

return json({
  success: true,
  owner,
  url: storeURL
});
  
      }
    if (path === "/api/ai") {
  const username = url.searchParams.get("username");
  const pass = url.searchParams.get("pass");
  const name = url.searchParams.get("name");
  const key = url.searchParams.get("key");
  const trainingText = url.searchParams.get("trainingText") || "";

  if (!username || !pass || !name || !key) {
    return new Response("Missing required fields", { status: 400 });
  }

  const storedPass = await env.Pass.get(username, { type: "text" });

  if (!storedPass)
    return new Response("Username not found", { status: 404 });

  if (storedPass !== pass)
    return new Response("Incorrect password", { status: 403 });

  const aiKey = `ai/${username}/${name}`;

  const existingAI = await env.AI.get(aiKey);

  if (!existingAI) {
    const current = await env.PAY.get(username);
    const balance = parseInt(current) || 0;

    if (balance < 10) {
      return new Response("Insufficient balance", { status: 402 });
    }

    const newBalance = balance - 10;
    await env.PAY.put(username, newBalance.toString());
  }

  await env.AI.put(aiKey, `${key}[*]${trainingText}`);

  return new Response(
    existingAI
      ? `AI ${name} updated successfully`
      : `AI ${name} created successfully (10 credits charged)`
  );
    }
    
// database-setup
    if (path === "/api/database-setup") {

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {

    const url = new URL(request.url);

    if (request.method === "POST") {
      const body = await request.json();
      const { username, pass } = body;

      if (!username || !pass) {
        return new Response("Missing username or pass", { status: 400 });
      }

      const storedPass = await env.Pass.get(username, { type: "text" });

      if (!storedPass)
        return new Response("Username not found", { status: 404 });

      if (storedPass !== pass)
        return new Response("Incorrect password", { status: 403 });

const existingDb = await env.STORAGE.get(`database/kv/${username}`);

if (existingDb) {
  return new Response("Database already exists", { status: 409 });
}
      
      const balanceRaw = await env.PAY.get(username);
      const balance = parseInt(balanceRaw) || 0;

      if (balance < 1000) {
        return new Response("Insufficient balance", { status: 402 });
      }

      await env.PAY.put(username, (balance - 1000).toString());

      const fiveGB = 5 * 1024 * 1024 * 1024;
      const today = new Date().toISOString().split("T")[0];
const apiKey ="cm_" +  crypto.randomUUID().replace(/-/g, "");
      
      const dbJson = {
  api: apiKey,
  storage: fiveGB,
  "used-storage": 0,
  "req-limit": 10000,
  "req-today": `0[*]${today}`,
  auto: false
};

      await env.STORAGE.put(
        `database/kv/${username}`,
        JSON.stringify(dbJson)
      );

      return new Response("Database setup completed");
    }

    if (request.method === "GET") {
      const username = url.searchParams.get("username");
const pass = url.searchParams.get("pass");

if (!username || !pass) {
  return new Response("Missing username or pass", { status: 400 });
}
const storedPass = await env.Pass.get(username, { type: "text" });

if (!storedPass)
  return new Response("Username not found", { status: 404 });

if (storedPass !== pass)
  return new Response("Incorrect password", { status: 403 });
    
      const data = await env.STORAGE.get(
        `database/kv/${username}`,
        { type: "json" }
      );

      if (!data) {
        return new Response("Database not found", { status: 404 });
      }

      return new Response(JSON.stringify(data), {
        headers: { "Content-Type": "application/json", ...corsHeaders }
      });
    }

    if (request.method === "PUT") {
      const body = await request.json();
      const { username, pass, type, "new-limit": newLimit } = body;

      if (!username || !pass || !type || newLimit === undefined) {
        return new Response("Missing fields", { status: 400 });
      }

      const storedPass = await env.Pass.get(username, { type: "text" });

      if (!storedPass)
        return new Response("Username not found", { status: 404 });

      if (storedPass !== pass)
        return new Response("Incorrect password", { status: 403 });

      const key = `database/kv/${username}`;
      const data = await env.STORAGE.get(key, { type: "json" });

      if (!data) {
        return new Response("Database not found", { status: 404 });
      }

      const balanceRaw = await env.PAY.get(username);
      let balance = parseInt(balanceRaw) || 0;

      if (type === "STORAGE") {
        const currentBytes = data.storage;
        const newGB = Number(newLimit);
        const newBytes = newGB * 1024 * 1024 * 1024;

        if (newBytes <= currentBytes) {
          return new Response("New limit must be greater", { status: 400 });
        }

        const increaseGB = (newBytes - currentBytes) / (1024 * 1024 * 1024);
        const cost = increaseGB * 200;

        if (balance < cost) {
          return new Response("Insufficient balance", { status: 402 });
        }

        balance -= cost;
        data.storage = newBytes;

        await env.PAY.put(username, balance.toString());
      }

      if (type === "REQ") {
        const addReq = Number(newLimit);

        if (addReq % 50000 !== 0) {
          return new Response("new-limit must be multiple of 50000", { status: 400 });
        }

        if (data["req-limit"] + addReq > 1_000_000) {
          return new Response("Request limit exceeds maximum", { status: 400 });
        }

        const units = addReq / 50000;
        const cost = units * 100;

        if (balance < cost) {
          return new Response("Insufficient balance", { status: 402 });
        }

        balance -= cost;
        data["req-limit"] += addReq;

        await env.PAY.put(username, balance.toString());
      }

      await env.STORAGE.put(key, JSON.stringify(data));

      return new Response("Database updated successfully");
    }

  } catch (err) {
    return new Response(err.message, { status: 500 });
  }
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

    if (request.method === "GET") {
      const url = new URL(request.url);
      const username = url.searchParams.get("username");

      if (!username) {
        return new Response(
          JSON.stringify({ success: false, error: "Username required" }),
          { status: 400, headers: corsHeaders }
        );
      }

      const current = await env.PAY.get(username);
      const balance = parseInt(current) || 0;

      return new Response(
        JSON.stringify({
          success: true,
          user: username,
          balance: balance
        }),
        {
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders
          }
        }
      );
    }

    if (request.method === "POST") {
      const data = await request.json();
      const { key, username, amount } = data;

      if (!username || amount === undefined) {
        return new Response(
          JSON.stringify({ success: false, error: "Missing fields" }),
          { status: 400, headers: corsHeaders }
        );
      }

      const payAmount = parseInt(amount);
      if (isNaN(payAmount) || payAmount <= 0) {
        return new Response(
          JSON.stringify({ success: false, error: "Invalid amount" }),
          { status: 400, headers: corsHeaders }
        );
      }

      const realKey = await env.FILES.get("KEY");
      if (key !== realKey) {
        return new Response(
          JSON.stringify({ success: false, error: "Invalid key" }),
          { status: 403, headers: corsHeaders }
        );
      }

      const current = await env.PAY.get(username);
      const currentBalance = parseInt(current) || 0;
      const newBalance = currentBalance + payAmount;

      await env.PAY.put(username, newBalance.toString());

      return new Response(
        JSON.stringify({
          success: true,
          user: username,
          paid: payAmount,
          total: newBalance
        }),
        {
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders
          }
        }
      );
    }

  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: corsHeaders }
    );
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
  const binary = new Uint8Array(await request.arrayBuffer());

  const user = request.headers.get("x-user");
  const pass = request.headers.get("x-pass");
  const filename = request.headers.get("x-filename");

  if (!user || !pass || !filename)
    return json({ error: "Missing user, pass, or filename header" }, 400);

  const storedPass = await env.Pass.get(user, { type: "text" });
  if (!storedPass)
    return json({ error: "User not found" }, 404);

  if (storedPass !== pass)
    return json({ error: "Incorrect password" }, 403);

  const fileKey = `${user}/${filename}`;
  const existingFile = await env.FILES.get(fileKey);

  if (!existingFile) {
    const payRaw = await env.PAY.get(user, { type: "text" });
    const pay = Number(payRaw ?? 0);

    if (pay < 10)
      return json({ error: "Insufficient balance" }, 402);

    await env.PAY.put(user, String(pay - 10));
  }

  await env.FILES.put(fileKey, binary);
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

  if (request.method === "GET") {
    question = url.searchParams.get("question") || "";
  } else if (request.method === "POST") {
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

  const apiKey = await env.FILES.get("OP", { type: "text" });

  if (!apiKey) {
    return json({ error: "OpenRouter API key not configured" }, 500);
  }

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "google/gemma-3-27b-it:free",
      messages: [
        {
          role: "user",
          content: question
        }
      ]
    })
  });

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

  return json({
    answer: data?.choices?.[0]?.message?.content?.trim() || "No response from AI"
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

  const { user, pass, filename, content } = body;

  if (!user || !pass || !filename) {
    return json({ error: "Missing user, pass or filename" }, 400);
  }

  const storedPass = await env.Pass.get(user, { type: "text" });

  if (!storedPass)
    return json({ success: false, error: "Username not found" }, 404);

  if (storedPass !== pass)
    return json({ success: false, error: "Incorrect password" }, 403);

  const fileKey = `${user}/${filename}`;

  const existingFile = await env.FILES.get(fileKey);

  if (!existingFile) {
    const current = await env.PAY.get(user);
    const balance = parseInt(current) || 0;

    if (balance < 5) {
      return json({
        success: false,
        error: "Insufficient balance"
      }, 402);
    }

    const newBalance = balance - 5;
    await env.PAY.put(user, newBalance.toString());
  }

  await env.FILES.put(fileKey, content ?? "");

  return json({
    success: true,
    message: existingFile
      ? "File updated successfully"
      : "File created successfully (5 credits charged)"
  });
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
    return json(
      { success: false, error: "Missing username or password" },
      400
    );

  // Allow only lowercase letters and numbers
  if (!/^[a-z0-9]+$/.test(username))
    return json(
      {
        success: false,
        error: "Username must contain only lowercase letters and numbers"
      },
      400
    );

  const existing = await env.Pass.get(username, { type: "text" });

  if (existing)
    return json(
      { success: false, error: "Username already exists" },
      409
    );

  await env.Pass.put(username, pass);
  await env.PAY.put(username, "30");

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
    return new Response("Code Mon Server Online", { headers: corsHeaders });
  }
};
