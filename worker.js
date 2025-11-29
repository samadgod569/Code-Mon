export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        // Enable CORS
        const corsHeaders = {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        };

        // Handle OPTIONS (CORS preflight)
        if (request.method === "OPTIONS") {
            return new Response("OK", { status: 200, headers: corsHeaders });
        }

        // -----------------------------
        // API: LIST FILES
        // -----------------------------
        if (url.pathname === "/api/list") {
            const user = url.searchParams.get("user");
            const list = await env.FILES.list({ prefix: `${user}/` });

            const files = list.keys.map(k => k.name.replace(`${user}/`, ""));
            return new Response(JSON.stringify(files), { headers: corsHeaders });
        }

        // -----------------------------
        // API: LOAD FILE
        // -----------------------------
        if (url.pathname === "/api/load") {
            const user = url.searchParams.get("user");
            const filename = url.searchParams.get("filename");

            const key = `${user}/${filename}`;
            const value = await env.FILES.get(key);

            return new Response(value || "", { headers: corsHeaders });
        }

        // -----------------------------
        // API: SAVE FILE
        // -----------------------------
        if (url.pathname === "/api/save" && request.method === "POST") {
            const body = await request.json();
            const key = `${body.user}/${body.filename}`;

            await env.FILES.put(key, body.content);

            return new Response(JSON.stringify({ success: true }), {
                headers: corsHeaders,
            });
        }

        // -----------------------------
        // API: DEPLOY FILE
        // -----------------------------
        if (url.pathname === "/api/deploy" && request.method === "POST") {
            const body = await request.json();
            const key = `${body.user}/${body.filename}`;

            const content = await env.FILES.get(key);
            if (!content) {
                return new Response(
                    JSON.stringify({ error: "File not found" }),
                    { status: 400, headers: corsHeaders }
                );
            }

            // Deployment = copy to public/ directory
            const publicKey = `public/${body.filename}`;
            await env.FILES.put(publicKey, content);

            return new Response(JSON.stringify({
                success: true,
                kv_url: `/public/${body.filename}`
            }), { headers: corsHeaders });
        }

        // -----------------------------
        // PUBLIC FILES
        // -----------------------------
        if (url.pathname.startsWith("/public/")) {
            const file = url.pathname.replace("/public/", "");
            const value = await env.FILES.get(`public/${file}`);

            if (!value) return new Response("Not found", { status: 404 });
            return new Response(value, { headers: corsHeaders });
        }

        return new Response("Not found", { status: 404, headers: corsHeaders });
    }
};
