function cors(response) {
    const headers = new Headers(response.headers);
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type");
    return new Response(response.body, { status: response.status, headers });
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        // CORS preflight
        if (request.method === "OPTIONS") {
            return cors(new Response(null, { status: 204 }));
        }

        // ---------------- LIST FILES ----------------
        if (url.pathname === "/api/list") {
            const user = url.searchParams.get("user");
            const list = await env.GITHUB_TOKEN.list({ prefix: `${user}/` });
            const files = list.keys.map(k => k.name.replace(`${user}/`, ""));
            return cors(new Response(JSON.stringify(files)));
        }

        // ---------------- LOAD FILE ----------------
        if (url.pathname === "/api/load") {
            const user = url.searchParams.get("user");
            const filename = url.searchParams.get("filename");
            const key = `${user}/${filename}`;
            const content = await env.GITHUB_TOKEN.get(key);
            return cors(new Response(content || ""));
        }

        // ---------------- SAVE FILE ----------------
        if (url.pathname === "/api/save" && request.method === "POST") {
            const data = await request.json();
            await env.GITHUB_TOKEN.put(`${data.user}/${data.filename}`, data.content);
            return cors(new Response("OK"));
        }

        // ---------------- DEPLOY ----------------
        if (url.pathname === "/api/deploy" && request.method === "POST") {
            try {
                const data = await request.json();
                const key = `${data.user}/${data.filename}`;
                const content = await env.GITHUB_TOKEN.get(key);

                if (!content) {
                    return cors(new Response(JSON.stringify({ error: "File empty" }), { status: 400 }));
                }

                const publicKey = `public/${data.filename}`;
                await env.GITHUB_TOKEN.put(publicKey, content);

                return cors(new Response(JSON.stringify({
                    kv_url: `https://code-mon.codemon.workers.dev/public/${data.filename}`
                }), {
                    headers: { "Content-Type": "application/json" }
                }));

            } catch (e) {
                return cors(new Response(JSON.stringify({ error: e.toString() }), { status: 500 }));
            }
        }

        // ---------------- PUBLIC FILE SERVE ----------------
        if (url.pathname.startsWith("/public/")) {
            const filename = url.pathname.replace("/public/", "");
            const content = await env.GITHUB_TOKEN.get(`public/${filename}`);
            return cors(new Response(content, {
                headers: { "Content-Type": "text/html" }
            }));
        }

        return cors(new Response("404 Not Found", { status: 404 }));
    }
};
