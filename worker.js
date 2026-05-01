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



    
if (path === "/cloudra/deploy" && request.method === "POST") {
  let body;

  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const {
    username,
    password,
    appName,
    appPassword,
    repo,
    zip,        // 👈 NEW
    language,
    startFile,
    packages
  } = body;

  // basic auth/required checks
  if (!username || !password || !appName) {
    return json({ error: "Missing required fields" }, 400);
  }

  // 🔥 NEW RULE: repo OR zip must exist
  if (!repo && !zip) {
    return json({ error: "Provide either repo or zip" }, 400);
  }

  try {
    const res = await fetch("http://45.137.70.54:8067/api/deploy", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        username,
        password,
        appName,
        appPassword,
        repo: repo || null,
        zip: zip || null,
        language,
        startFile,
        packages,
        key: "*()+!"
      })
    });

    const text = await res.text();

    return new Response(text, {
      status: res.status,
      headers: {
        "Content-Type": res.headers.get("Content-Type") || "application/json",
        ...corsHeaders
      }
    });

  } catch (err) {
    return json({
      error: "Failed to connect to deploy API",
      details: err.message
    }, 500);
  }
}



if (path === "/ai-1.1") {
  const url = new URL(request.url);
  const question = url.searchParams.get("question");

  if (!question) return json({ error: "Missing question" }, 400);

  const MODEL = "openai/gpt-oss-120b:free";
  const YT_API_KEY = env.FILES.get("google");

  let keysRaw = await env.FILES.get("OPR");
  if (!keysRaw) return json({ error: "No API keys found" }, 500);

  let keys;
  try {
    keys = JSON.parse(keysRaw);
  } catch {
    return json({ error: "Invalid key format in KV" }, 500);
  }

  if (!Array.isArray(keys) || !keys.length)
    return json({ error: "No valid API keys" }, 500);

  const safeJson = async (res) => {
    const text = await res.text();
    if (!text || text.trim().startsWith("<")) return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  };

  let customData = [];
  try {
    const dataRes = await fetch("https://craftersmc-navigators.xyz/ai-data.json");
    const dataJson = await safeJson(dataRes);
    if (Array.isArray(dataJson)) customData = dataJson;
  } catch {}

  const isCraftersMCRelated = (title) => {
    const t = title.toLowerCase();
    return (
      t.includes("craftersmc") ||
      t.includes("crafters mc") ||
      t.includes("#craftersmc") ||
      t.includes("crafters server") ||
      t.includes("crafters smp")
    );
  };

  const STOPWORDS = new Set([
    "what","where","when","who","how","why","is","are","was","were","the",
    "a","an","in","on","of","to","do","does","did","can","could","would",
    "should","tell","me","about","give","info","explain","describe","get",
    "find","show","list","and","or","for","with","that","this","its","it",
    "i","my","your","their","there","here","have","has","had","been","be"
  ]);

  const extractKeywords = (q) => {
    const words = q.toLowerCase()
      .replace(/[^\w\s]/g, "")
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOPWORDS.has(w));
    const phrases = [];
    for (let i = 0; i < words.length - 1; i++) {
      phrases.push(words[i] + " " + words[i + 1]);
    }
    return { words, phrases };
  };

  const levenshtein = (a, b) => {
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, (_, i) =>
      Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
    );
    for (let i = 1; i <= m; i++)
      for (let j = 1; j <= n; j++)
        dp[i][j] = a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    return dp[m][n];
  };

  const similarity = (a, b) => {
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 1;
    return (maxLen - levenshtein(a, b)) / maxLen;
  };

  const prefixMatch = (word, target) =>
    target.startsWith(word) || word.startsWith(target);

  const bigrams = (str) => {
    const set = new Set();
    for (let i = 0; i < str.length - 1; i++) set.add(str.slice(i, i + 2));
    return set;
  };

  const bigramSimilarity = (a, b) => {
    const ba = bigrams(a), bb = bigrams(b);
    let shared = 0;
    for (const bg of ba) if (bb.has(bg)) shared++;
    return (2 * shared) / (ba.size + bb.size || 1);
  };

  const scoreCustomEntry = (entry, keywords) => {
    const { words, phrases } = keywords;
    const text = ((entry.title ?? "") + " " + (entry.data ?? "")).toLowerCase();
    const textWords = text.split(/[\s\-_,.:;!?]+/);
    let score = 0;

    for (const phrase of phrases) {
      if (text.includes(phrase)) {
        score += 2.5;
      } else {
        const phraseSim = bigramSimilarity(text, phrase);
        if (phraseSim >= 0.55) score += phraseSim * 1.8;
      }
    }

    for (const kw of words) {
      let best = 0;
      for (const tw of textWords) {
        if (tw === kw) { best = Math.max(best, 1.8); continue; }
        if (tw.includes(kw)) { best = Math.max(best, 1.3); continue; }
        if (kw.includes(tw) && tw.length > 3) { best = Math.max(best, 1.0); continue; }
        if (prefixMatch(kw, tw) && kw.length > 3) { best = Math.max(best, 0.9); continue; }
        if (Math.abs(tw.length - kw.length) > 4) continue;
        const lSim = similarity(tw, kw);
        if (lSim >= 0.82) { best = Math.max(best, lSim * 1.1); continue; }
        const bSim = bigramSimilarity(tw, kw);
        if (bSim >= 0.6) best = Math.max(best, bSim * 0.8);
      }
      score += best;
    }

    return score;
  };

  const scoreYouTubeTitle = (title, keywords) => {
    const { words, phrases } = keywords;
    const titleLower = title.toLowerCase();
    const titleWords = titleLower.split(/[\s\-_]+/);
    let score = 0;

    for (const phrase of phrases) {
      if (titleLower.includes(phrase)) score += 3.0;
    }

    for (const kw of words) {
      for (const tw of titleWords) {
        if (tw === kw) { score += 2.0; break; }
        if (tw.includes(kw)) { score += 1.5; break; }
      }
    }

    if (isCraftersMCRelated(title)) score += 5.0;

    return score;
  };

  let youtubVideos = [];
  try {
    const keywords = extractKeywords(question);
    const ytQuery = `${question} in CraftersMC`;
    const ytSearchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
    ytSearchUrl.searchParams.set("part", "snippet");
    ytSearchUrl.searchParams.set("q", ytQuery);
    ytSearchUrl.searchParams.set("maxResults", "10");
    ytSearchUrl.searchParams.set("type", "video");
    ytSearchUrl.searchParams.set("relevanceLanguage", "en");
    ytSearchUrl.searchParams.set("key", YT_API_KEY);

    const ytRes = await fetch(ytSearchUrl.toString());
    const ytData = await safeJson(ytRes);

    if (ytData?.items?.length) {
      youtubVideos = ytData.items
        .map(item => ({
          videoId: item.id?.videoId ?? null,
          title: item.snippet?.title ?? "",
          description: item.snippet?.description ?? "",
          channel: item.snippet?.channelTitle ?? "",
          thumbnail: item.snippet?.thumbnails?.high?.url ?? item.snippet?.thumbnails?.default?.url ?? null,
          publishedAt: item.snippet?.publishedAt ?? null,
          score: scoreYouTubeTitle(item.snippet?.title ?? "", keywords)
        }))
        .filter(v => v.videoId && v.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
    }
  } catch {}

  let lastError = "All keys failed";

  for (const key of keys) {
    try {
      const keywords = extractKeywords(question);

      if (!keywords.words.length) {
        lastError = "Could not extract keywords from question";
        continue;
      }

      const scoredCustom = customData
        .map(entry => ({ entry, score: scoreCustomEntry(entry, keywords) }))
        .filter(r => r.score > 1.0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 12);

      if (!scoredCustom.length && !youtubVideos.length) {
        lastError = "No relevant data found for question";
        continue;
      }

      const enrichedCustom = await Promise.all(
        scoredCustom.map(async ({ entry }) => {
          if (entry.img) {
            return { ...entry, resolvedImg: entry.img };
          }
          try {
            const titleForFile = (entry.title ?? "").replace(/ /g, "_") + ".png";
            const params = new URLSearchParams({
              action: "query",
              titles: `File:${titleForFile}`,
              prop: "imageinfo",
              iiprop: "url",
              format: "json"
            });
            const res = await fetch(`https://craftersmc.wiki.gg/api.php?${params}`, {
              headers: {
                "User-Agent": "CraftersMCBot/1.0 (cloudflare-worker)",
                "Accept": "application/json"
              }
            });
            const data = await safeJson(res);
            let imgUrl = null;
            for (const id in data?.query?.pages ?? {}) {
              if (id === "-1") break;
              imgUrl = data.query.pages[id]?.imageinfo?.[0]?.url ?? null;
            }
            return { ...entry, resolvedImg: imgUrl };
          } catch {
            return { ...entry, resolvedImg: null };
          }
        })
      );

      const customContextBlocks = enrichedCustom.map(e => {
        const imgLine = e.resolvedImg ? `Image: ${e.resolvedImg}\n` : "";
        return `### ${e.title ?? "Custom Entry"}\n${imgLine}${e.data ?? ""}`;
      });

      const customSources = enrichedCustom
        .filter(e => e.title && e.url)
        .map(e => ({
          title: e.title,
          url: e.url,
          imgUrl: e.resolvedImg ?? null
        }));

      const youtubeContextBlock = youtubVideos.length
        ? `## YOUTUBE VIDEOS\n` + youtubVideos.map(v =>
            `Video Title: ${v.title}\nChannel: ${v.channel}\nVideo ID: ${v.videoId}\nThumbnail: ${v.thumbnail ?? "none"}\nDescription: ${v.description}\nPublished: ${v.publishedAt ?? "unknown"}\nEmbed URL: https://www.youtube.com/embed/${v.videoId}`
          ).join("\n\n")
        : "";

      const context = [
        ...(customContextBlocks.length
          ? ["## CUSTOM DATA (from data.json — treat as authoritative)", ...customContextBlocks]
          : []),
        ...(youtubeContextBlock ? [youtubeContextBlock] : [])
      ]
        .join("\n\n")
        .slice(0, 30000);

      const finalRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${key}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            {
              role: "system",
              content: `You are a CraftersMC assistant. You will receive two types of context:

1. CUSTOM DATA — manually curated entries from data.json. These are authoritative. Use them as your primary source.
2. YOUTUBE VIDEOS — search results from YouTube relevant to the question. Each entry includes a title, channel, description, video ID, and embed URL.

Rules for custom data:
- NEVER use outside knowledge, assumptions, or training data
- NEVER invent items, stats, recipes, or mechanics
- Custom data entries are pre-vetted — use them as-is
- If something is not in the context at all, say: The data does not have that information
- You may embed an item image once at the top using markdown: ![Title](image_url)
- Only use image URLs explicitly provided in the context under Image: — never guess or invent image URLs

Rules for YouTube videos:
- If one or more YouTube videos are present in the context and are relevant to the question, suggest them to the user
- For each suggested video, render it as an embedded iframe using this exact format so the user can watch it directly:
  <iframe width="560" height="315" src="https://www.youtube.com/embed/VIDEO_ID" frameborder="0" allowfullscreen></iframe>
- Replace VIDEO_ID with the actual Video ID from the context
- Below each iframe, write the video title and channel name in plain text
- Only suggest videos that are genuinely relevant to what the user asked — do not force video suggestions if they do not match
- Never invent or guess video IDs or URLs — only use what is explicitly in the context`
            },
            {
              role: "user",
              content: `QUESTION: ${question}\n\nCONTEXT:\n${context}`
            }
          ]
        })
      });

      const out = await safeJson(finalRes);
      const content = out?.choices?.[0]?.message?.content ?? "";

      if (!content) {
        lastError = "Empty response from model";
        continue;
      }

      return json({
        content,
        sources: customSources,
        videos: youtubVideos.map(v => ({
          videoId: v.videoId,
          title: v.title,
          channel: v.channel,
          thumbnail: v.thumbnail,
          embedUrl: `https://www.youtube.com/embed/${v.videoId}`
        })),
        suggestions: youtubVideos.map(v => ({
          videoId: v.videoId,
          title: v.title,
          channel: v.channel,
          thumbnail: v.thumbnail,
          description: v.description,
          publishedAt: v.publishedAt,
          embedUrl: `https://www.youtube.com/embed/${v.videoId}`,
          score: v.score
        }))
      });

    } catch (e) {
      lastError = e.message;
    }
  }

  return json({ error: lastError }, 500);
                                               }


    
if (path === "/api/auction") {
  const url = new URL(request.url);

  let apiKey;
  try {
    apiKey = await env.FILES.get("CMC-API");
    if (!apiKey) return json({ error: "API key not found" }, 500);
  } catch {
    return json({ error: "Failed to retrieve API key" }, 500);
  }

  try {
    const res = await fetch(`https://api.craftersmc.net/v1/skyblock/auctions`, {
      headers: {
        "X-API-Key": apiKey
      }
    });

    const text = await res.text();

    if (!text || text.trim().startsWith("<")) {
      return json({ error: "Invalid response from CraftersMC API" }, 502);
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return json({ error: "Failed to parse CraftersMC API response" }, 502);
    }

    if (!res.ok) {
      return json({ error: data?.message ?? "CraftersMC API error", status: res.status }, res.status);
    }

    return json(data);

  } catch (e) {
    return json({ error: e.message }, 500);
  }
      }
    



if (path === "/ai-1.1-backup") {
  const url = new URL(request.url);
  const question = url.searchParams.get("question");

  if (!question) return json({ error: "Missing question" }, 400);

  const MODEL = "openai/gpt-oss-120b:free";
  const YT_API_KEY = await env.FILES.get("google");

  let keysRaw = await env.FILES.get("OPR");
  if (!keysRaw) return json({ error: "No API keys found" }, 500);

  let keys;
  try {
    keys = JSON.parse(keysRaw);
  } catch {
    return json({ error: "Invalid key format in KV" }, 500);
  }

  if (!Array.isArray(keys) || !keys.length)
    return json({ error: "No valid API keys" }, 500);

  const safeJson = async (res) => {
    const text = await res.text();
    if (!text || text.trim().startsWith("<")) return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  };

  let customData = [];
  try {
    const dataRes = await fetch("https://craftersmc-navigators.xyz/ai-data.json");
    const dataJson = await safeJson(dataRes);
    if (Array.isArray(dataJson)) customData = dataJson;
  } catch {}

  const isCraftersMCRelated = (title) => {
    const t = title.toLowerCase();
    return (
      t.includes("craftersmc") ||
      t.includes("crafters mc") ||
      t.includes("#craftersmc") ||
      t.includes("crafters server") ||
      t.includes("crafters smp")
    );
  };

  const scoreYouTubeTitle = (title, keywords) => {
    const { words, phrases } = keywords;
    const titleLower = title.toLowerCase();
    const titleWords = titleLower.split(/[\s\-_]+/);
    let score = 0;

    for (const phrase of phrases) {
      if (titleLower.includes(phrase)) score += 3.0;
    }

    for (const kw of words) {
      for (const tw of titleWords) {
        if (tw === kw) { score += 2.0; break; }
        if (tw.includes(kw)) { score += 1.5; break; }
      }
    }

    if (isCraftersMCRelated(title)) score += 5.0;

    return score;
  };

  let youtubVideos = [];
  try {
    const ytSearchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
    ytSearchUrl.searchParams.set("part", "snippet");
    ytSearchUrl.searchParams.set("q", `CraftersMC ${question}`);
    ytSearchUrl.searchParams.set("maxResults", "10");
    ytSearchUrl.searchParams.set("type", "video");
    ytSearchUrl.searchParams.set("relevanceLanguage", "en");
    ytSearchUrl.searchParams.set("key", YT_API_KEY);

    const ytRes = await fetch(ytSearchUrl.toString());
    const ytData = await safeJson(ytRes);

    if (ytData?.items?.length) {
      const keywords = (() => {
        const STOPWORDS = new Set([
          "what","where","when","who","how","why","is","are","was","were","the",
          "a","an","in","on","of","to","do","does","did","can","could","would",
          "should","tell","me","about","give","info","explain","describe","get",
          "find","show","list","and","or","for","with","that","this","its","it",
          "i","my","your","their","there","here","have","has","had","been","be"
        ]);
        const words = question.toLowerCase()
          .replace(/[^\w\s]/g, "")
          .split(/\s+/)
          .filter(w => w.length > 2 && !STOPWORDS.has(w));
        const phrases = [];
        for (let i = 0; i < words.length - 1; i++) phrases.push(words[i] + " " + words[i + 1]);
        return { words, phrases };
      })();

      youtubVideos = ytData.items
        .map(item => ({
          videoId: item.id?.videoId ?? null,
          title: item.snippet?.title ?? "",
          description: item.snippet?.description ?? "",
          channel: item.snippet?.channelTitle ?? "",
          thumbnail: item.snippet?.thumbnails?.high?.url ?? item.snippet?.thumbnails?.default?.url ?? null,
          publishedAt: item.snippet?.publishedAt ?? null,
          score: scoreYouTubeTitle(item.snippet?.title ?? "", keywords)
        }))
        .filter(v => v.videoId && v.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
    }
  } catch {}

  async function getAllPages() {
    let allPages = [];
    let apcontinue = "";
    while (true) {
      const apiUrl = new URL("https://craftersmc.wiki.gg/api.php");
      apiUrl.searchParams.set("action", "query");
      apiUrl.searchParams.set("list", "allpages");
      apiUrl.searchParams.set("aplimit", "max");
      apiUrl.searchParams.set("apnamespace", "0");
      apiUrl.searchParams.set("format", "json");
      if (apcontinue) apiUrl.searchParams.set("apcontinue", apcontinue);
      const res = await fetch(apiUrl.toString(), {
        headers: {
          "User-Agent": "CraftersMCBot/1.0 (cloudflare-worker)",
          "Accept": "application/json"
        }
      });
      const data = await safeJson(res);
      if (!data) break;
      allPages.push(...(data?.query?.allpages ?? []));
      if (!data.continue?.apcontinue) break;
      apcontinue = data.continue.apcontinue;
    }
    return allPages;
  }

  const levenshtein = (a, b) => {
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, (_, i) =>
      Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
    );
    for (let i = 1; i <= m; i++)
      for (let j = 1; j <= n; j++)
        dp[i][j] = a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    return dp[m][n];
  };

  const similarity = (a, b) => {
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 1;
    return (maxLen - levenshtein(a, b)) / maxLen;
  };

  const prefixMatch = (word, target) =>
    target.startsWith(word) || word.startsWith(target);

  const bigrams = (str) => {
    const set = new Set();
    for (let i = 0; i < str.length - 1; i++) set.add(str.slice(i, i + 2));
    return set;
  };

  const bigramSimilarity = (a, b) => {
    const ba = bigrams(a), bb = bigrams(b);
    let shared = 0;
    for (const bg of ba) if (bb.has(bg)) shared++;
    return (2 * shared) / (ba.size + bb.size || 1);
  };

  const STOPWORDS = new Set([
    "what","where","when","who","how","why","is","are","was","were","the",
    "a","an","in","on","of","to","do","does","did","can","could","would",
    "should","tell","me","about","give","info","explain","describe","get",
    "find","show","list","and","or","for","with","that","this","its","it",
    "i","my","your","their","there","here","have","has","had","been","be"
  ]);

  const extractKeywords = (q) => {
    const words = q.toLowerCase()
      .replace(/[^\w\s]/g, "")
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOPWORDS.has(w));
    const phrases = [];
    for (let i = 0; i < words.length - 1; i++) {
      phrases.push(words[i] + " " + words[i + 1]);
    }
    return { words, phrases };
  };

  const scoreTitle = (title, keywords) => {
    const { words, phrases } = keywords;
    const titleLower = title.toLowerCase();
    const titleWords = titleLower.split(/[\s\-_]+/);
    let score = 0;

    for (const phrase of phrases) {
      if (titleLower.includes(phrase)) {
        score += 3.0;
      } else {
        const phraseSim = bigramSimilarity(titleLower, phrase);
        if (phraseSim >= 0.6) score += phraseSim * 2.0;
      }
    }

    for (const kw of words) {
      let best = 0;
      for (const tw of titleWords) {
        if (tw === kw) { best = Math.max(best, 2.0); continue; }
        if (tw.includes(kw)) { best = Math.max(best, 1.5); continue; }
        if (kw.includes(tw) && tw.length > 3) { best = Math.max(best, 1.2); continue; }
        if (prefixMatch(kw, tw) && kw.length > 3) { best = Math.max(best, 1.0); continue; }
        if (Math.abs(tw.length - kw.length) > 4) continue;
        const lSim = similarity(tw, kw);
        if (lSim >= 0.82) { best = Math.max(best, lSim * 1.3); continue; }
        const bSim = bigramSimilarity(tw, kw);
        if (bSim >= 0.6) best = Math.max(best, bSim * 0.9);
      }
      score += best;
    }

    for (const kw of words) {
      if (titleLower.includes(kw)) score += 0.5;
    }

    if (titleWords.length <= 3 && score > 0) score += 0.4;

    for (const kw of words) {
      if (titleLower.startsWith(kw)) score += 0.6;
    }

    return score;
  };

  const scoreCustomEntry = (entry, keywords) => {
    const { words, phrases } = keywords;
    const text = (entry.des ?? "").toLowerCase();
    const textWords = text.split(/[\s\-_,.:;!?]+/);
    let score = 0;

    for (const phrase of phrases) {
      if (text.includes(phrase)) {
        score += 2.5;
      } else {
        const phraseSim = bigramSimilarity(text, phrase);
        if (phraseSim >= 0.55) score += phraseSim * 1.8;
      }
    }

    for (const kw of words) {
      let best = 0;
      for (const tw of textWords) {
        if (tw === kw) { best = Math.max(best, 1.8); continue; }
        if (tw.includes(kw)) { best = Math.max(best, 1.3); continue; }
        if (kw.includes(tw) && tw.length > 3) { best = Math.max(best, 1.0); continue; }
        if (prefixMatch(kw, tw) && kw.length > 3) { best = Math.max(best, 0.9); continue; }
        if (Math.abs(tw.length - kw.length) > 4) continue;
        const lSim = similarity(tw, kw);
        if (lSim >= 0.82) { best = Math.max(best, lSim * 1.1); continue; }
        const bSim = bigramSimilarity(tw, kw);
        if (bSim >= 0.6) best = Math.max(best, bSim * 0.8);
      }
      score += best;
    }

    return score;
  };

  let lastError = "All keys failed";

  for (const key of keys) {
    try {
      const keywords = extractKeywords(question);

      if (!keywords.words.length) {
        lastError = "Could not extract keywords from question";
        continue;
      }

      const scoredCustom = customData
        .map(entry => ({ entry, score: scoreCustomEntry(entry, keywords) }))
        .filter(r => r.score > 1.0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map(r => r.entry);

      const customContextBlocks = scoredCustom.map(e => {
        const imgLine = e.img ? `Image: ${e.img}\n` : "";
        return `### ${e.title ?? "Custom Entry"}\n${imgLine}${e.data ?? e.des ?? ""}`;
      });

      const customSources = scoredCustom
        .filter(e => e.title && e.url)
        .map(e => ({
          title: e.title,
          url: e.url,
          imgUrl: e.img ?? null
        }));

      const allPages = await getAllPages();
      if (!allPages.length) {
        lastError = "Could not fetch wiki page list";
        continue;
      }

      const allTitles = allPages.map(p => p.title);

      const scored = allTitles
        .map(title => ({ title, score: scoreTitle(title, keywords) }))
        .filter(r => r.score > 0)
        .sort((a, b) => b.score - a.score);

      const MIN = 7;
      let chosenTitles = scored.slice(0, MIN).map(r => r.title);

      if (scored.length > MIN) {
        const threshold = scored[MIN - 1].score * 0.8;
        for (let i = MIN; i < scored.length; i++) {
          if (scored[i].score >= threshold) chosenTitles.push(scored[i].title);
          else break;
        }
      }

      chosenTitles = chosenTitles.slice(0, 12);

      if (!chosenTitles.length && !scoredCustom.length && !youtubVideos.length) {
        lastError = "No relevant pages found for question";
        continue;
      }

      const fetchedPages = (
        await Promise.all(
          chosenTitles.map(async (title) => {
            const params = new URLSearchParams({
              action: "query",
              prop: "revisions",
              rvprop: "content",
              rvslots: "main",
              redirects: "1",
              titles: title,
              format: "json"
            });
            const res = await fetch(`https://craftersmc.wiki.gg/api.php?${params}`, {
              headers: {
                "User-Agent": "CraftersMCBot/1.0 (cloudflare-worker)",
                "Accept": "application/json"
              }
            });
            const data = await safeJson(res);
            if (!data) return null;
            let raw = "";
            let resolvedTitle = title;
            for (const id in data?.query?.pages ?? {}) {
              if (id === "-1") return null;
              resolvedTitle = data.query.pages[id]?.title ?? title;
              raw = data.query.pages[id]?.revisions?.[0]?.slots?.main?.["*"] ?? "";
            }
            if (!raw.trim()) return null;
            return {
              title: resolvedTitle,
              url: `https://craftersmc.wiki.gg/wiki/${encodeURIComponent(resolvedTitle.replace(/ /g, "_"))}`,
              content: raw
            };
          })
        )
      ).filter(Boolean);

      const pagesWithImages = await Promise.all(
        fetchedPages.map(async (page) => {
          try {
            const fileName = page.title.replace(/ /g, "_") + ".png";
            const params = new URLSearchParams({
              action: "query",
              titles: `File:${fileName}`,
              prop: "imageinfo",
              iiprop: "url",
              format: "json"
            });
            const res = await fetch(`https://craftersmc.wiki.gg/api.php?${params}`, {
              headers: {
                "User-Agent": "CraftersMCBot/1.0 (cloudflare-worker)",
                "Accept": "application/json"
              }
            });
            const data = await safeJson(res);
            let imgUrl = null;
            for (const id in data?.query?.pages ?? {}) {
              if (id === "-1") break;
              imgUrl = data.query.pages[id]?.imageinfo?.[0]?.url ?? null;
            }
            return { ...page, imgUrl };
          } catch {
            return { ...page, imgUrl: null };
          }
        })
      );

      const wikiContextBlocks = pagesWithImages.map(p => {
        const imgLine = p.imgUrl ? `Image: ${p.imgUrl}\n` : "";
        return `### ${p.title}\n${imgLine}${p.content}`;
      });

      const youtubeContextBlock = youtubVideos.length
        ? `## YOUTUBE VIDEOS\n` + youtubVideos.map(v =>
            `Video Title: ${v.title}\nChannel: ${v.channel}\nVideo ID: ${v.videoId}\nThumbnail: ${v.thumbnail ?? "none"}\nDescription: ${v.description}\nPublished: ${v.publishedAt ?? "unknown"}\nEmbed URL: https://www.youtube.com/embed/${v.videoId}`
          ).join("\n\n")
        : "";

      const context = [
        ...(customContextBlocks.length
          ? ["## CUSTOM DATA (from data.json — treat as authoritative)", ...customContextBlocks]
          : []),
        ...(wikiContextBlocks.length
          ? ["## WIKI DATA (raw wikitext)", ...wikiContextBlocks]
          : []),
        ...(youtubeContextBlock ? [youtubeContextBlock] : [])
      ]
        .join("\n\n")
        .slice(0, 30000);

      const finalRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${key}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            {
              role: "system",
              content: `You are a CraftersMC wiki assistant. You will receive three types of context:

1. CUSTOM DATA — manually curated entries. These are authoritative and override wiki data on the same topic.
2. WIKI DATA — raw MediaWiki wikitext from the CraftersMC wiki.
3. YOUTUBE VIDEOS — search results from YouTube relevant to the question. Each entry includes a title, channel, description, video ID, and embed URL.

How to read wikitext:
- {{TemplateName|arg1|arg2|key=value}} are templates with real game data — read arguments carefully.
  - {{item|Diamond Sword|1}} means 1x Diamond Sword
  - {{craft table|result=...|materials=...}} means a crafting recipe
  - {{infobox|...}} means structured item or mob data
  - {{minion|Fire|V}} means Fire Minion V
  - {{color|...}}, {{rarity|...}}, {{icon|...}} are display hints — extract the value inside
  - Navigation, stub, and navbox templates have no useful data — skip them
- [[Link|Display Text]] refers to Display Text as a wiki page or item
- [[Link]] means the word itself is the page or item name
- Bold and italic markers are emphasis only, not meaningful data
- == Section == is a section heading
- * item is a bullet list entry
- <ref>...</ref> is a citation footnote — ignore it
- <br>, <div>, <span> are HTML layout tags — ignore the tags but keep inner text if meaningful

Rules for wiki and custom data:
- NEVER use outside knowledge, assumptions, or training data
- NEVER invent items, stats, recipes, or mechanics
- Custom data entries are pre-vetted — use them as-is
- Extract all relevant data from templates and wikitext — do not skip template contents
- If crafting or obtaining info is present, list all materials with exact quantities and workstation requirements
- If something is not in the context at all, say: The wiki does not have that information
- You may embed an item image once at the top using markdown: ![Title](image_url)
- Only use image URLs explicitly provided in the context under Image: — never guess or invent image URLs

Rules for YouTube videos:
- If one or more YouTube videos are present in the context and are relevant to the question, suggest them to the user
- For each suggested video, render it as an embedded iframe using this exact format so the user can watch it directly:
  <iframe width="560" height="315" src="https://www.youtube.com/embed/VIDEO_ID" frameborder="0" allowfullscreen></iframe>
- Replace VIDEO_ID with the actual Video ID from the context
- Below each iframe, write the video title and channel name in plain text
- Only suggest videos that are genuinely relevant to what the user asked — do not force video suggestions if they do not match
- Never invent or guess video IDs or URLs — only use what is explicitly in the context`
            },
            {
              role: "user",
              content: `QUESTION: ${question}\n\nCONTEXT:\n${context}`
            }
          ]
        })
      });

      const out = await safeJson(finalRes);
      const content = out?.choices?.[0]?.message?.content ?? "";

      if (!content) {
        lastError = "Empty response from model";
        continue;
      }

      return json({
        content,
        sources: [
          ...pagesWithImages.map(p => ({
            title: p.title,
            url: p.url,
            imgUrl: p.imgUrl
          })),
          ...customSources
        ],
        videos: youtubVideos.map(v => ({
          videoId: v.videoId,
          title: v.title,
          channel: v.channel,
          thumbnail: v.thumbnail,
          embedUrl: `https://www.youtube.com/embed/${v.videoId}`
        }))
      });

    } catch (e) {
      lastError = e.message;
    }
  }

  return json({ error: lastError }, 500);
}





if (path === "/ai") {
  const url = new URL(request.url);
  const question = url.searchParams.get("question");

  if (!question) return json({ error: "Missing question" }, 400);

  const MODEL = "openai/gpt-oss-120b:free";

  let keysRaw = await env.FILES.get("OPR");
  if (!keysRaw) return json({ error: "No API keys found" }, 500);

  let keys;
  try {
    keys = JSON.parse(keysRaw);
  } catch {
    return json({ error: "Invalid key format in KV" }, 500);
  }

  if (!Array.isArray(keys) || !keys.length)
    return json({ error: "No valid API keys" }, 500);

  const safeJson = async (res) => {
    const text = await res.text();
    if (!text || text.trim().startsWith("<")) return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  };

  async function getAllPages() {
    let allPages = [];
    let apcontinue = "";
    while (true) {
      const apiUrl = new URL("https://craftersmc.wiki.gg/api.php");
      apiUrl.searchParams.set("action", "query");
      apiUrl.searchParams.set("list", "allpages");
      apiUrl.searchParams.set("aplimit", "max");
      apiUrl.searchParams.set("apnamespace", "0");
      apiUrl.searchParams.set("format", "json");
      if (apcontinue) apiUrl.searchParams.set("apcontinue", apcontinue);
      const res = await fetch(apiUrl.toString(), {
        headers: {
          "User-Agent": "CraftersMCBot/1.0 (cloudflare-worker)",
          "Accept": "application/json"
        }
      });
      const data = await safeJson(res);
      if (!data) break;
      allPages.push(...(data?.query?.allpages ?? []));
      if (!data.continue?.apcontinue) break;
      apcontinue = data.continue.apcontinue;
    }
    return allPages;
  }

  const levenshtein = (a, b) => {
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, (_, i) =>
      Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
    );
    for (let i = 1; i <= m; i++)
      for (let j = 1; j <= n; j++)
        dp[i][j] = a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    return dp[m][n];
  };

  const similarity = (a, b) => {
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 1;
    return (maxLen - levenshtein(a, b)) / maxLen;
  };

  const prefixMatch = (word, target) =>
    target.startsWith(word) || word.startsWith(target);

  const bigrams = (str) => {
    const set = new Set();
    for (let i = 0; i < str.length - 1; i++) set.add(str.slice(i, i + 2));
    return set;
  };

  const bigramSimilarity = (a, b) => {
    const ba = bigrams(a), bb = bigrams(b);
    let shared = 0;
    for (const bg of ba) if (bb.has(bg)) shared++;
    return (2 * shared) / (ba.size + bb.size || 1);
  };

  const STOPWORDS = new Set([
    "what","where","when","who","how","why","is","are","was","were","the",
    "a","an","in","on","of","to","do","does","did","can","could","would",
    "should","tell","me","about","give","info","explain","describe","get",
    "find","show","list","and","or","for","with","that","this","its","it",
    "i","my","your","their","there","here","have","has","had","been","be"
  ]);

  const extractKeywords = (q) => {
    const words = q.toLowerCase()
      .replace(/[^\w\s]/g, "")
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOPWORDS.has(w));
    const phrases = [];
    for (let i = 0; i < words.length - 1; i++) {
      phrases.push(words[i] + " " + words[i + 1]);
    }
    return { words, phrases };
  };

  const scoreTitle = (title, keywords) => {
    const { words, phrases } = keywords;
    const titleLower = title.toLowerCase();
    const titleWords = titleLower.split(/[\s\-_]+/);
    let score = 0;

    for (const phrase of phrases) {
      if (titleLower.includes(phrase)) {
        score += 3.0;
      } else {
        const phraseSim = bigramSimilarity(titleLower, phrase);
        if (phraseSim >= 0.6) score += phraseSim * 2.0;
      }
    }

    for (const kw of words) {
      let best = 0;
      for (const tw of titleWords) {
        if (tw === kw) { best = Math.max(best, 2.0); continue; }
        if (tw.includes(kw)) { best = Math.max(best, 1.5); continue; }
        if (kw.includes(tw) && tw.length > 3) { best = Math.max(best, 1.2); continue; }
        if (prefixMatch(kw, tw) && kw.length > 3) { best = Math.max(best, 1.0); continue; }
        if (Math.abs(tw.length - kw.length) > 4) continue;
        const lSim = similarity(tw, kw);
        if (lSim >= 0.82) { best = Math.max(best, lSim * 1.3); continue; }
        const bSim = bigramSimilarity(tw, kw);
        if (bSim >= 0.6) best = Math.max(best, bSim * 0.9);
      }
      score += best;
    }

    for (const kw of words) {
      if (titleLower.includes(kw)) score += 0.5;
    }

    if (titleWords.length <= 3 && score > 0) score += 0.4;

    for (const kw of words) {
      if (titleLower.startsWith(kw)) score += 0.6;
    }

    return score;
  };

  let lastError = "All keys failed";

  for (const key of keys) {
    try {
      const allPages = await getAllPages();
      if (!allPages.length) {
        lastError = "Could not fetch wiki page list";
        continue;
      }

      const allTitles = allPages.map(p => p.title);
      const keywords = extractKeywords(question);

      if (!keywords.words.length) {
        lastError = "Could not extract keywords from question";
        continue;
      }

      const scored = allTitles
        .map(title => ({ title, score: scoreTitle(title, keywords) }))
        .filter(r => r.score > 0)
        .sort((a, b) => b.score - a.score);

      const MIN = 7;
      let chosenTitles = scored.slice(0, MIN).map(r => r.title);

      if (scored.length > MIN) {
        const threshold = scored[MIN - 1].score * 0.8;
        for (let i = MIN; i < scored.length; i++) {
          if (scored[i].score >= threshold) chosenTitles.push(scored[i].title);
          else break;
        }
      }

      chosenTitles = chosenTitles.slice(0, 12);

      if (!chosenTitles.length) {
        lastError = "No relevant pages found for question";
        continue;
      }

      const fetchedPages = (
        await Promise.all(
          chosenTitles.map(async (title) => {
            const params = new URLSearchParams({
              action: "query",
              prop: "revisions",
              rvprop: "content",
              rvslots: "main",
              redirects: "1",
              titles: title,
              format: "json"
            });
            const res = await fetch(`https://craftersmc.wiki.gg/api.php?${params}`, {
              headers: {
                "User-Agent": "CraftersMCBot/1.0 (cloudflare-worker)",
                "Accept": "application/json"
              }
            });
            const data = await safeJson(res);
            if (!data) return null;
            let raw = "";
            let resolvedTitle = title;
            for (const id in data?.query?.pages ?? {}) {
              if (id === "-1") return null;
              resolvedTitle = data.query.pages[id]?.title ?? title;
              // ✅ Keep the raw wikitext — no cleaning at all
              raw = data.query.pages[id]?.revisions?.[0]?.slots?.main?.["*"] ?? "";
            }
            if (!raw.trim()) return null;
            return {
              title: resolvedTitle,
              url: `https://craftersmc.wiki.gg/wiki/${encodeURIComponent(resolvedTitle.replace(/ /g, "_"))}`,
              content: raw   // raw wikitext passed as-is
            };
          })
        )
      ).filter(Boolean);

      if (!fetchedPages.length) {
        lastError = "All chosen pages were empty";
        continue;
      }

      const pagesWithImages = await Promise.all(
        fetchedPages.map(async (page) => {
          try {
            const fileName = page.title.replace(/ /g, "_") + ".png";
            const params = new URLSearchParams({
              action: "query",
              titles: `File:${fileName}`,
              prop: "imageinfo",
              iiprop: "url",
              format: "json"
            });
            const res = await fetch(`https://craftersmc.wiki.gg/api.php?${params}`, {
              headers: {
                "User-Agent": "CraftersMCBot/1.0 (cloudflare-worker)",
                "Accept": "application/json"
              }
            });
            const data = await safeJson(res);
            let imgUrl = null;
            for (const id in data?.query?.pages ?? {}) {
              if (id === "-1") break;
              imgUrl = data.query.pages[id]?.imageinfo?.[0]?.url ?? null;
            }
            return { ...page, imgUrl };
          } catch {
            return { ...page, imgUrl: null };
          }
        })
      );

      // ✅ Raised slice limit since raw wikitext is denser — adjust as needed
      const context = pagesWithImages
        .map(p => {
          const imgLine = p.imgUrl ? `Image: ${p.imgUrl}\n` : "";
          return `### ${p.title}\n${imgLine}${p.content}`;
        })
        .join("\n\n")
        .slice(0, 30000);

      const finalRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${key}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            {
              role: "system",
              content: `You are a CraftersMC wiki assistant. You will receive raw MediaWiki wikitext scraped directly from the CraftersMC wiki. Your job is to read and interpret this wikitext accurately to answer the user's question.

## How to read wikitext:
- \`{{TemplateName|arg1|arg2|key=value}}\` are templates. Many contain real game data — read their arguments carefully.
  - \`{{item|Diamond Sword|1}}\` → 1x Diamond Sword
  - \`{{craft table|result=...|materials=...}}\` → a crafting recipe with listed materials
  - \`{{infobox|...}}\` → structured item/mob data such as stats, rarity, type
  - \`{{minion|Fire|V}}\` → Fire Minion V
  - \`{{color|...}}\`, \`{{rarity|...}}\`, \`{{icon|...}}\` → cosmetic/display hints, extract the value inside
  - Navigation, stub, and navbox templates have no useful data — skip them
- \`[[Link|Display Text]]\` → refers to "Display Text" as a wiki page or item name
- \`[[Link]]\` → the word itself is the page/item name
- \`'''bold'''\` and \`''italic''\` → emphasis, not meaningful data
- \`== Section ==\` → section heading
- \`* item\` → bullet list entry
- \`<ref>...</ref>\` → citation footnote, ignore
- \`<br>\`, \`<div>\`, \`<span>\` etc. → HTML layout tags, ignore the tags but keep inner text if meaningful

## Rules:
- NEVER use outside knowledge, assumptions, or training data
- NEVER invent items, stats, recipes, or mechanics
- Extract and present all relevant data found inside templates and wikitext — do not skip template contents
- If crafting/obtaining info is present, list all materials with exact quantities and any workstation/requirement
- If something is not in the context at all, say: "The wiki does not have that information."
- You may embed the item image once at the top using markdown: ![Title](image_url)
- Only use image URLs explicitly provided in the context under "Image:". Never guess or invent image URLs`
            },
            {
              role: "user",
              content: `QUESTION: ${question}\n\nCONTEXT (raw wikitext):\n${context}`
            }
          ]
        })
      });

      const out = await safeJson(finalRes);
      const content = out?.choices?.[0]?.message?.content ?? "";

      if (!content) {
        lastError = "Empty response from model";
        continue;
      }

      return json({
        content,
        sources: pagesWithImages.map(p => ({
          title: p.title,
          url: p.url,
          imgUrl: p.imgUrl
        }))
      });

    } catch (e) {
      lastError = e.message;
    }
  }

  return json({ error: lastError }, 500);
      }
                        
if (path === "/ai-backup") {
  const url = new URL(request.url);
  const question = url.searchParams.get("question");

  if (!question) return json({ error: "Missing question" }, 400);

  const MODEL = "openai/gpt-oss-120b:free";

  let keysRaw = await env.FILES.get("OPR");
  if (!keysRaw) return json({ error: "No API keys found" }, 500);

  let keys;
  try {
    keys = JSON.parse(keysRaw);
  } catch {
    return json({ error: "Invalid key format in KV" }, 500);
  }

  if (!Array.isArray(keys) || !keys.length)
    return json({ error: "No valid API keys" }, 500);

  const safeJson = async (res) => {
    const text = await res.text();
    if (!text || text.trim().startsWith("<")) return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  };

  const resolveTemplate = (templateContent) => {
    const parts = templateContent.split("|");
    const name = (parts[0] || "").trim().toLowerCase().replace(/\s+/g, " ");

    const posArgs = [];
    const namedArgs = {};
    for (let i = 1; i < parts.length; i++) {
      const part = parts[i];
      const eqIdx = part.indexOf("=");
      if (eqIdx > 0) {
        const key = part.slice(0, eqIdx).trim();
        if (/^[\w ]+$/.test(key)) {
          namedArgs[key.toLowerCase()] = part.slice(eqIdx + 1);
          continue;
        }
      }
      posArgs.push(part.trim());
    }

    const pos0 = (posArgs[0] || "").trim();
    const pos1 = (posArgs[1] || "").trim();

    switch (name) {
      case "item": {
        const itemName = (pos0 || (namedArgs["name"] || "")).trim();
        const qty = (pos1 || "").trim();
        if (!itemName) return "";
        return qty ? `${qty}x ${itemName}` : itemName;
      }
      case "mob":
      case "name":
      case "icon":
      case "color":
      case "rarity":
        return pos0;
      case "minion": {
        const type = pos0;
        const level = pos1;
        if (!type) return "";
        return level ? `${type} Minion ${level}` : `${type} Minion`;
      }
      case "*":
        return "\n• ";
      case "craft table": {
        const result = (namedArgs["result"] || pos0 || "").trim();
        const rawMats = (namedArgs["materials"] || "").trim();
        const source = (namedArgs["source"] || "").trim();
        let out = result ? `\n[Recipe] ${result}\n` : "\n[Recipe]\n";
        if (rawMats) {
          const matLines = rawMats
            .split("\n")
            .map((l) => l.replace(/^\*+\s*/, "").trim())
            .filter(Boolean)
            .map((l) => `  • ${l}`)
            .join("\n");
          if (matLines) out += `  Materials:\n${matLines}\n`;
        }
        if (source) out += `  Requires: ${source}\n`;
        return out;
      }
      case "patch":
        return pos0 ? `v${pos0}` : "";
      case "history":
        return (namedArgs["update"] || pos0 || "").trim();
      case "table":
      case "allp":
        return "";
      default:
        if (
          name.startsWith("navbox") ||
          name.startsWith("infobox") ||
          name.startsWith("stub")
        ) return "";
        return pos0;
    }
  };

  const cleanText = (raw) => {
    if (!raw) return "";
    let t = raw;

    t = t.replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, "");
    t = t.replace(/<ref[^>]*\/>/gi, "");

    let passes = 0;
    while (passes++ < 300) {
      const m = t.match(/\{\{([^{}]*)\}\}/);
      if (!m) break;
      const resolved = resolveTemplate(m[1]);
      t = t.slice(0, m.index) + resolved + t.slice(m.index + m[0].length);
    }
    t = t.replace(/\{\{[\s\S]*?\}\}/g, "");

    t = t.replace(/\n={2,6}\s*Navigation\s*={2,6}[\s\S]*/i, "");

    t = t.replace(/\[\[(?:[^\]|]*\|)?([^\]]+)\]\]/g, "$1");

    t = t.replace(/<[^>]+>/g, "");

    t = t.replace(/'{2,3}/g, "");

    t = t.replace(/\[\d+\]/g, "");

    t = t.replace(/[ \t]{2,}/g, " ");
    t = t.replace(/\n{4,}/g, "\n\n\n");
    t = t.replace(/[ \t]+$/gm, "");

    t = t.replace(/={2,6}\s*(.+?)\s*={2,6}/g, (_, h) => `\n\n[${h.trim()}]\n`);

    return t.trim().slice(0, 12000);
  };

  async function getAllPages() {
    let allPages = [];
    let apcontinue = "";
    while (true) {
      const apiUrl = new URL("https://craftersmc.wiki.gg/api.php");
      apiUrl.searchParams.set("action", "query");
      apiUrl.searchParams.set("list", "allpages");
      apiUrl.searchParams.set("aplimit", "max");
      apiUrl.searchParams.set("apnamespace", "0");
      apiUrl.searchParams.set("format", "json");
      if (apcontinue) apiUrl.searchParams.set("apcontinue", apcontinue);
      const res = await fetch(apiUrl.toString(), {
        headers: {
          "User-Agent": "CraftersMCBot/1.0 (cloudflare-worker)",
          "Accept": "application/json"
        }
      });
      const data = await safeJson(res);
      if (!data) break;
      allPages.push(...(data?.query?.allpages ?? []));
      if (!data.continue?.apcontinue) break;
      apcontinue = data.continue.apcontinue;
    }
    return allPages;
  }

  const levenshtein = (a, b) => {
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, (_, i) =>
      Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
    );
    for (let i = 1; i <= m; i++)
      for (let j = 1; j <= n; j++)
        dp[i][j] = a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    return dp[m][n];
  };

  const similarity = (a, b) => {
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 1;
    return (maxLen - levenshtein(a, b)) / maxLen;
  };

  const prefixMatch = (word, target) =>
    target.startsWith(word) || word.startsWith(target);

  const bigrams = (str) => {
    const set = new Set();
    for (let i = 0; i < str.length - 1; i++) set.add(str.slice(i, i + 2));
    return set;
  };

  const bigramSimilarity = (a, b) => {
    const ba = bigrams(a), bb = bigrams(b);
    let shared = 0;
    for (const bg of ba) if (bb.has(bg)) shared++;
    return (2 * shared) / (ba.size + bb.size || 1);
  };

  const STOPWORDS = new Set([
    "what","where","when","who","how","why","is","are","was","were","the",
    "a","an","in","on","of","to","do","does","did","can","could","would",
    "should","tell","me","about","give","info","explain","describe","get",
    "find","show","list","and","or","for","with","that","this","its","it",
    "i","my","your","their","there","here","have","has","had","been","be"
  ]);

  const extractKeywords = (q) => {
    const words = q.toLowerCase()
      .replace(/[^\w\s]/g, "")
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOPWORDS.has(w));
    const phrases = [];
    for (let i = 0; i < words.length - 1; i++) {
      phrases.push(words[i] + " " + words[i + 1]);
    }
    return { words, phrases };
  };

  const scoreTitle = (title, keywords) => {
    const { words, phrases } = keywords;
    const titleLower = title.toLowerCase();
    const titleWords = titleLower.split(/[\s\-_]+/);
    let score = 0;

    for (const phrase of phrases) {
      if (titleLower.includes(phrase)) {
        score += 3.0;
      } else {
        const phraseSim = bigramSimilarity(titleLower, phrase);
        if (phraseSim >= 0.6) score += phraseSim * 2.0;
      }
    }

    for (const kw of words) {
      let best = 0;
      for (const tw of titleWords) {
        if (tw === kw) { best = Math.max(best, 2.0); continue; }
        if (tw.includes(kw)) { best = Math.max(best, 1.5); continue; }
        if (kw.includes(tw) && tw.length > 3) { best = Math.max(best, 1.2); continue; }
        if (prefixMatch(kw, tw) && kw.length > 3) { best = Math.max(best, 1.0); continue; }
        if (Math.abs(tw.length - kw.length) > 4) continue;
        const lSim = similarity(tw, kw);
        if (lSim >= 0.82) { best = Math.max(best, lSim * 1.3); continue; }
        const bSim = bigramSimilarity(tw, kw);
        if (bSim >= 0.6) best = Math.max(best, bSim * 0.9);
      }
      score += best;
    }

    for (const kw of words) {
      if (titleLower.includes(kw)) score += 0.5;
    }

    if (titleWords.length <= 3 && score > 0) score += 0.4;

    for (const kw of words) {
      if (titleLower.startsWith(kw)) score += 0.6;
    }

    return score;
  };

  let lastError = "All keys failed";

  for (const key of keys) {
    try {
      const allPages = await getAllPages();
      if (!allPages.length) {
        lastError = "Could not fetch wiki page list";
        continue;
      }

      const allTitles = allPages.map(p => p.title);
      const keywords = extractKeywords(question);

      if (!keywords.words.length) {
        lastError = "Could not extract keywords from question";
        continue;
      }

      const scored = allTitles
        .map(title => ({ title, score: scoreTitle(title, keywords) }))
        .filter(r => r.score > 0)
        .sort((a, b) => b.score - a.score);

      const MIN = 7;
      let chosenTitles = scored.slice(0, MIN).map(r => r.title);

      if (scored.length > MIN) {
        const threshold = scored[MIN - 1].score * 0.8;
        for (let i = MIN; i < scored.length; i++) {
          if (scored[i].score >= threshold) chosenTitles.push(scored[i].title);
          else break;
        }
      }

      chosenTitles = chosenTitles.slice(0, 12);

      if (!chosenTitles.length) {
        lastError = "No relevant pages found for question";
        continue;
      }

      const fetchedPages = (
        await Promise.all(
          chosenTitles.map(async (title) => {
            const params = new URLSearchParams({
              action: "query",
              prop: "revisions",
              rvprop: "content",
              rvslots: "main",
              redirects: "1",
              titles: title,
              format: "json"
            });
            const res = await fetch(`https://craftersmc.wiki.gg/api.php?${params}`, {
              headers: {
                "User-Agent": "CraftersMCBot/1.0 (cloudflare-worker)",
                "Accept": "application/json"
              }
            });
            const data = await safeJson(res);
            if (!data) return null;
            let raw = "";
            let resolvedTitle = title;
            for (const id in data?.query?.pages ?? {}) {
              if (id === "-1") return null;
              resolvedTitle = data.query.pages[id]?.title ?? title;
              raw = data.query.pages[id]?.revisions?.[0]?.slots?.main?.["*"] ?? "";
            }
            const cleaned = cleanText(raw);
            if (!cleaned) return null;
            return {
              title: resolvedTitle,
              url: `https://craftersmc.wiki.gg/wiki/${encodeURIComponent(resolvedTitle.replace(/ /g, "_"))}`,
              content: cleaned
            };
          })
        )
      ).filter(Boolean);

      if (!fetchedPages.length) {
        lastError = "All chosen pages were empty after cleaning";
        continue;
      }

      const pagesWithImages = await Promise.all(
        fetchedPages.map(async (page) => {
          try {
            const fileName = page.title.replace(/ /g, "_") + ".png";
            const params = new URLSearchParams({
              action: "query",
              titles: `File:${fileName}`,
              prop: "imageinfo",
              iiprop: "url",
              format: "json"
            });
            const res = await fetch(`https://craftersmc.wiki.gg/api.php?${params}`, {
              headers: {
                "User-Agent": "CraftersMCBot/1.0 (cloudflare-worker)",
                "Accept": "application/json"
              }
            });
            const data = await safeJson(res);
            let imgUrl = null;
            for (const id in data?.query?.pages ?? {}) {
              if (id === "-1") break;
              imgUrl = data.query.pages[id]?.imageinfo?.[0]?.url ?? null;
            }
            return { ...page, imgUrl };
          } catch {
            return { ...page, imgUrl: null };
          }
        })
      );

      const context = pagesWithImages
        .map(p => {
          const imgLine = p.imgUrl ? `Image: ${p.imgUrl}\n` : "";
          return `### ${p.title}\n${imgLine}${p.content}`;
        })
        .join("\n\n")
        .slice(0, 20000);

      const finalRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${key}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            {
              role: "system",
              content: `You are a CraftersMC wiki assistant. Answer using ONLY the provided context. You have zero outside knowledge — if it is not in the context, it does not exist.

Rules:
- NEVER use outside knowledge, assumptions, or training data
- NEVER invent items, stats, recipes, or mechanics
- If the context has crafting or obtaining info, list materials in bullet points with exact quantities and requirements
- If something is not in the context, say: "The wiki does not have that information."
- You may embed the item image once at the top of your response using markdown: ![Title](image_url)
- Only use image URLs explicitly provided in the context under "Image:". Never invent or guess image URLs`
            },
            {
              role: "user",
              content: `QUESTION: ${question}\n\nCONTEXT:\n${context}`
            }
          ]
        })
      });

      const out = await safeJson(finalRes);
      const content = out?.choices?.[0]?.message?.content ?? "";

      if (!content) {
        lastError = "Empty response from model";
        continue;
      }

      return json({
        content,
        sources: pagesWithImages.map(p => ({
          title: p.title,
          url: p.url,
          imgUrl: p.imgUrl
        }))
      });

    } catch (e) {
      lastError = e.message;
    }
  }

  return json({ error: lastError }, 500);
          }

if (path === "/openIDE/likes" && request.method === "POST") {
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const { username, password, id } = body;
  if (!username || !password || !id) return json({ error: "Missing username, password or id" }, 400);

  const storedPass = await env.Pass.get(username, { type: "text" });
  if (!storedPass) return json({ error: "Username not found" }, 404);
  if (storedPass !== password) return json({ error: "Incorrect password" }, 403);

  const extensionsRaw = await env.FILES.get("extensions", { type: "json" });
  if (!extensionsRaw || !Array.isArray(extensionsRaw)) return json({ error: "Extensions not found" }, 404);

  const extension = extensionsRaw.find(ext => ext.id === id);
  if (!extension) return json({ error: "Extension not found" }, 404);

  if (!Array.isArray(extension.stars)) extension.stars = [];

  if (extension.stars.includes(username)) {
    return json({ success: false, message: "Already liked" });
  }

  extension.stars.push(username);

  // Save updated extensions back
  await env.FILES.put("extensions", JSON.stringify(extensionsRaw));

  return json({ success: true, message: "Liked successfully", id, stars: extension.stars });
}


if (path === "/openIDE/extensions" && request.method === "GET") {
  const extensionsRaw = await env.FILES.get("extensions", { type: "json" });
  if (!extensionsRaw) return json({ error: "Extensions not found" }, 404);

  return new Response(JSON.stringify(extensionsRaw), {
    status: 200,
    headers: { "Content-Type": "application/json", ...corsHeaders }
  });
}  
// 1. /api/api-save
if (path === "/api/api-save") {
  let body;
  try { body = await request.json(); } 
  catch { return json({ error: "Invalid JSON" }, 400); }

  const { user, pass, key, content } = body;
  if (!user || !pass || !key) return json({ error: "Missing user, pass, or key" }, 400);

  const storedPass = await env.Pass.get(user, { type: "text" });
  if (!storedPass) return json({ error: "Username not found" }, 404);
  if (storedPass !== pass) return json({ error: "Incorrect password" }, 403);

  const kvKey = `${user}/${key}`;
  const exists = await env.API.get(kvKey);

  if (exists === null) {
    return json({ error: "Key does not exist" }, 404);
  }

  await env.API.put(kvKey, content ?? "");

  return json({
    success: true,
    message: "Content saved",
    key
  });
}

// 2. /api/api-create (charges 5 shells)
if (path === "/api/api-create") {
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const { user, pass } = body;
  if (!user || !pass) return json({ error: "Missing user or pass" }, 400);

  const storedPass = await env.Pass.get(user, { type: "text" });
  if (!storedPass) return json({ success: false, error: "Username not found" }, 404);
  if (storedPass !== pass) return json({ success: false, error: "Incorrect password" }, 403);

  const balance = parseInt(await env.PAY.get(user)) || 0;
  if (balance < 5) return json({ success: false, error: "Insufficient balance" }, 402);

  const key = `#$$${Math.floor(1000000 + Math.random() * 9000000)}`;
  await env.API.put(`${user}/${key}`, "Welcome");
  await env.PAY.put(user, (balance - 5).toString());

  return json({ success: true, key, message: "Key created (5 shells charged)", balance: balance - 5 });
}

// 3. /api/api-load
if (path === "/api/api-load") {
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const { user, pass, key } = body;
  if (!user || !pass || !key) return json({ error: "Missing user, pass, or key" }, 400);

  const storedPass = await env.Pass.get(user, { type: "text" });
  if (!storedPass) return json({ success: false, error: "Username not found" }, 404);
  if (storedPass !== pass) return json({ success: false, error: "Incorrect password" }, 403);

  const content = await env.API.get(`${user}/${key}`);
  if (!content) return json({ success: false, error: "Key not found" }, 404);

  return json({ success: true, key, content });
}

// 4. /api/api-list
if (path === "/api/api-list") {
  const user = url.searchParams.get("user");
  const pass = url.searchParams.get("pass");

  if (!user || !pass) return json({ error: "Missing user or pass" }, 400);

  const storedPass = await env.Pass.get(user, { type: "text" });
  if (!storedPass) return json({ error: "Username not found" }, 404);
  if (storedPass !== pass) return json({ error: "Incorrect password" }, 403);

  const list = await env.API.list({ prefix: `${user}/` });

  return json({
    keys: list.keys.map(k => k.name.replace(`${user}/`, ""))
  });
}

// 5. /api/api-delete
if (path === "/api/api-delete") {
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const { user, pass, key } = body;
  if (!user || !pass || !key) return json({ error: "Missing user, pass, or key" }, 400);

  const storedPass = await env.Pass.get(user, { type: "text" });
  if (!storedPass) return json({ success: false, error: "Username not found" }, 404);
  if (storedPass !== pass) return json({ success: false, error: "Incorrect password" }, 403);

  await env.API.delete(`${user}/${key}`);
  return json({ success: true, message: "Key deleted successfully" });
                                        }
  




    
if (path === "/api/credits") {

let username = "";
let password = "";
let plan = null;

const PLANS = {
  1: { shells: 100, credits: 30 },
  2: { shells: 500, credits: 150 },
  3: { shells: 1000, credits: 300 },
  4: { shells: 5000, credits: 1500 },
  5: { shells: 10000, credits: 3000 }
};

if (request.method === "GET") {

  username = url.searchParams.get("username") || "";

  if (!username) {
    return new Response(JSON.stringify({ error: "Missing username" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  const shellsRaw = await env.PAY.get(username);
  const creditsRaw = await env.CREDITS.get(username);

  const shells = Number(shellsRaw) || 0;
  const credits = Number(creditsRaw) || 0;

  return new Response(JSON.stringify({
    username,
    shells,
    credits
  }), {
    headers: { "Content-Type": "application/json" }
  });
}

if (request.method === "POST") {

  try {
    const body = await request.json();
    username = body.username || "";
    password = body.password || "";
    plan = Number(body.plan);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  if (!username || !password || !plan) {
    return new Response(JSON.stringify({
      error: "Missing username, password or plan"
    }), {
      status: 400,
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

  const planData = PLANS[plan];

  if (!planData) {
    return new Response(JSON.stringify({
      error: "Invalid plan",
      allowed_plans: Object.keys(PLANS)
    }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  const shellsRaw = await env.PAY.get(username);
  const shells = Number(shellsRaw);

  if (!shellsRaw || isNaN(shells)) {
    return new Response(JSON.stringify({ error: "Shell balance not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" }
    });
  }

  if (shells < planData.shells) {
    return new Response(JSON.stringify({
      error: "Not enough shells",
      required: planData.shells,
      current: shells
    }), {
      status: 402,
      headers: { "Content-Type": "application/json" }
    });
  }

  const newShells = shells - planData.shells;

  const creditsRaw = await env.CREDITS.get(username);
  const credits = Number(creditsRaw) || 0;

  const newCredits = credits + planData.credits;

  await env.PAY.put(username, String(newShells));
  await env.CREDITS.put(username, String(newCredits));

  return new Response(JSON.stringify({
    success: true,
    plan,
    shells_spent: planData.shells,
    credits_added: planData.credits,
    shells_remaining: newShells,
    credits_total: newCredits
  }), {
    headers: { "Content-Type": "application/json" }
  });

}

}

    

if (path === "/api/agent") {
  let question = "";
  let modelKey = "gpt-oss";
  let username = "";
  let password = "";

  const MODEL_CONFIG = {
  "gpt-5.2-pro": { "model": "openai/gpt-5.2-pro" },
  "gpt-5.2": { "model": "openai/gpt-5.2" },

  "claude-opus-4.6": { "model": "anthropic/claude-opus-4-6" },
  "claude-sonnet-4.6": { "model": "anthropic/claude-sonnet-4-6" },

  "claude-opus-4.5": { "model": "anthropic/claude-opus-4-5" },
  "claude-sonnet-4.5": { "model": "anthropic/claude-sonnet-4-5" },
  "claude-haiku-4.5": { "model": "anthropic/claude-haiku-4-5-20251001" },

  "gemini-3-pro": { "model": "google/gemini-3-pro-preview" },
  "gemini-3.1-pro": { "model": "google/gemini-3.1-pro-preview" },

  "qwen3-8b": { "model": "Qwen/Qwen3-8B" },
  "qwen2-vl": { "model": "Qwen/Qwen2-VL-7B-Instruct" },

  "deepseek-coder-1.3b": { "model": "deepseek-ai/deepseek-coder-1.3b-base" },
  "deepseek-coder-33b": { "model": "deepseek-ai/deepseek-coder-33b-instruct" },

  "llama-3-70b": { "model": "v2ray/Llama-3-70B" },
  "llama-3.1-8b": { "model": "meta-llama/Llama-3.1-8B" }
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

  const creditRaw = await env.CREDITS.get(username);
  const credits = Number(creditRaw);

  if (!creditRaw || isNaN(credits)) {
    return new Response(JSON.stringify({ error: "Credits not found" }), {
      status: 402,
      headers: { "Content-Type": "application/json" }
    });
  }

  if (credits < 4) {
    return new Response(JSON.stringify({ error: "Insufficient credits" }), {
      status: 402,
      headers: { "Content-Type": "application/json" }
    });
  }

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

  const keys = await env.FILES.get("OPRT", { type: "json" });

  if (!Array.isArray(keys) || keys.length === 0) {
    return new Response(JSON.stringify({ error: "Bytez keys missing" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  let lastError = null;

  const requestBody = {
    input: question,
    stream: true,
    params: {
          
    
    "temperature": 0.5
    }
  };

  for (const apiKey of keys) {
    try {
      const res = await fetch(`https://api.bytez.com/models/v2/${cfg.model}`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestBody)
      });

      if (res.ok) {

        const newCredits = credits - 4;
        await env.CREDITS.put(username, String(newCredits));

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
    error: "All Bytez API keys failed",
    details: lastError
  }), {
    status: 502,
    headers: { "Content-Type": "application/json" }
  });
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
