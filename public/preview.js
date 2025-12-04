// preview.js
let raw = localStorage.getItem("codeMonGenerated");
if (!raw) {
    document.body.innerHTML = "<h2>No preview data found.</h2>";
    throw new Error("No data in localStorage");
}

// Fix relative paths
raw = raw.replace(/(src|href)="img\//g, '$1="./img/');

// -------------------------------
// EXTRACT BODY
// -------------------------------
const bodyMatch = raw.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
const bodyContent = bodyMatch ? bodyMatch[1] : raw;

// Clear the current body and inject content once
document.body.innerHTML = bodyContent;

// -------------------------------
// EXTRACT AND INJECT INLINE STYLES
// -------------------------------
[...raw.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].forEach(match => {
    const style = document.createElement("style");
    style.textContent = match[1];
    document.head.appendChild(style);
});

// -------------------------------
// EXTRACT AND INJECT LINK TAGS
// -------------------------------
[...raw.matchAll(/<link[^>]+href="([^"]+)"[^>]*>/gi)].forEach(match => {
    const linkEl = document.createElement("link");
    linkEl.rel = "stylesheet";
    linkEl.href = match[1];
    document.head.appendChild(linkEl);
});

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
[...raw.matchAll(/<script(?![^>]+src)[^>]*>([\s\S]*?)<\/script>/gi)].forEach(match => {
    const script = document.createElement("script");
    script.textContent = match[1];
    document.body.appendChild(script);
});
