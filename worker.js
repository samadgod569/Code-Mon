export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const path = url.pathname;

        // CORS
        const corsHeaders = {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "*"
        };

        if (request.method === "OPTIONS") {
            return new Response("OK", { headers: corsHeaders });
        }

        // Helper to reply json with CORS
        function json(data, status = 200) {
            return new Response(JSON.stringify(data), {
                status,
                headers: { "Content-Type": "application/json", ...corsHeaders }
            });
        }

        // -------------------------------
        // /api/list  (GET)
        // -------------------------------
        if (path === "/api/list" && request.method === "GET") {
            const user = url.searchParams.get("user");
            if (!user) return json({ error: "Missing user" }, 400);

            const list = await env.GITHUB_TOKEN.list({ prefix: `${user}/` });

            const filenames = list.keys.map(k => k.name.replace(`${user}/`, ""));
            return json(filenames);
        }

        // -------------------------------
        // /api/load  (GET)
        // -------------------------------
        if (path === "/api/load" && request.method === "GET") {
            const user = url.searchParams.get("user");
            const filename = url.searchParams.get("filename");

            if (!user || !filename) 
                return json({ error: "Missing fields" }, 400);

            const value = await env.GITHUB_TOKEN.get(`${user}/${filename}`);

            return new Response(value || "", {
                status: 200,
                headers: { "Content-Type": "text/plain", ...corsHeaders }
            });
        }

        // -------------------------------
        // /api/save  (POST)
        // -------------------------------
        if (path === "/api/save" && request.method === "POST") {
            const body = await request.json().catch(() => null);
            if (!body) return json({ error: "Invalid JSON" }, 400);

            const { user, filename, content } = body;
            if (!user || !filename) return json({ error: "Missing fields" }, 400);

            await env.GITHUB_TOKEN.put(`${user}/${filename}`, content);

            return json({ success: true });
        }

        // -------------------------------
        // /api/deploy  (POST)
        // -------------------------------
        if (path === "/api/deploy" && request.method === "POST") {
            const body = await request.json().catch(() => null);
            if (!body) return json({ error: "Invalid JSON" }, 400);

            const { user, filename } = body;
            if (!user || !filename) return json({ error: "Missing fields" }, 400);

            const fileContent = await env.GITHUB_TOKEN.get(`${user}/${filename}`);
            if (!fileContent) return json({ error: "File not found" }, 404);

            // Deploy to KV public endpoint
            await env.GITHUB_TOKEN.put(`public/${user}/${filename}`, fileContent);

            return json({
                success: true,
                kv_url: `https://code-mon.codemon.workers.dev/public/${user}/${filename}`
            });
        }

        // -------------------------------
        // If route not found
        // -------------------------------
        return json({ error: "Route not found" }, 404);
    }
};
