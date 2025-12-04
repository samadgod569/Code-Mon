// preview.js

// Load stored HTML
let raw = localStorage.getItem("codeMonGenerated");

if (!raw) {
    document.body.innerHTML = "<h2>No preview data found.</h2>";
    throw new Error("No data in localStorage");
}

// Fix relative paths for images and links
raw = raw.replace(/(src|href)="img\//g, '$1="./img/');

// -------------------------------
// PARSE HEAD
// -------------------------------
const headMatch = raw.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
if (headMatch) {
    const headContent = headMatch[1];

    // Inline <style>
    [...headContent.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].forEach(match => {
        const style = document.createElement("style");
        style.textContent = match[1];
        document.head.appendChild(style);
    });

    // <link> tags
    [...headContent.matchAll(/<link[^>]+href="([^"]+)"[^>]*>/gi)].forEach(match => {
        const linkEl = document.createElement("link");
        linkEl.rel = "stylesheet";
        linkEl.href = match[1];
        document.head.appendChild(linkEl);
    });

    // <meta>, <title>, etc.
    [...headContent.matchAll(/<(meta|title)[^>]*>[\s\S]*?<\/title>?/gi)].forEach(match => {
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = match[0];
        Array.from(tempDiv.children).forEach(el => document.head.appendChild(el));
    });
}

// -------------------------------
// PARSE BODY
// -------------------------------
const bodyMatch = raw.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
let bodyContent = bodyMatch ? bodyMatch[1] : raw;

// Clear existing body
document.body.innerHTML = "";

// Inject body content once
document.body.innerHTML = bodyContent;

// -------------------------------
// EXTERNAL SCRIPT SRC
// -------------------------------
[...raw.matchAll(/<script[^>]+src="([^"]+)"[^>]*><\/script>/gi)].forEach(match => {
    const script = document.createElement("script");
    script.src = match[1];
    script.defer = true;
    document.body.appendChild(script);
});

// -------------------------------
// INLINE SCRIPTS
// -------------------------------
[...raw.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].forEach(match => {
    if (match[0].includes('src=')) return; // skip external
    const script = document.createElement("script");
    script.textContent = match[1];
    document.body.appendChild(script);
});
