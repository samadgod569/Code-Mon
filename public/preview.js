// LOAD STORED HTML
let raw = localStorage.getItem("codeMonGenerated");

if (!raw) {
    document.body.innerHTML = "<h2>No preview data found.</h2>";
    throw new Error("No data in localStorage");
}


// -------------------------------
// 0. FIX RELATIVE PATHS FOR PREVIEW
// -------------------------------
// Convert "img/" → "./img/" so browser loads it correctly
raw = raw.replace(/src="img\//g, 'src="./img/')
         .replace(/href="img\//g, 'href="./img/');


// -------------------------------
// 1. EXTRACT BODY CONTENT
// -------------------------------
let bodyMatch = raw.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
let bodyContent = bodyMatch ? bodyMatch[1] : "";

document.body.innerHTML = bodyContent;


// -------------------------------
// 2. EXTRACT AND INJECT INLINE STYLES
// -------------------------------
let styleMatches = [...raw.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)];

styleMatches.forEach(match => {
    let style = document.createElement("style");
    style.textContent = match[1];
    document.head.appendChild(style);
});


// -------------------------------
// 3. EXTRACT & INJECT EXTERNAL CSS
// -------------------------------
let linkMatches = [...raw.matchAll(/<link[^>]+href="([^"]+)"[^>]*>/gi)];

linkMatches.forEach(match => {
    let href = match[1];

    let linkEl = document.createElement("link");
    linkEl.rel = "stylesheet";
    linkEl.href = href;

    document.head.appendChild(linkEl);
});


// -------------------------------
// 4. EXTRACT & INJECT EXTERNAL SCRIPT SRC
// -------------------------------
let scriptSrcMatches = [...raw.matchAll(/<script[^>]+src="([^"]+)"[^>]*><\/script>/gi)];

scriptSrcMatches.forEach(match => {
    let src = match[1];

    let script = document.createElement("script");
    script.src = src;
    document.body.appendChild(script);
});


// -------------------------------
// 5. EXTRACT & EXECUTE INLINE SCRIPTS
// -------------------------------
let scriptInlineMatches = [...raw.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)];

scriptInlineMatches.forEach(match => {
    if (match[0].includes("src=")) return; // skip external
    let script = document.createElement("script");
    script.textContent = match[1];
    document.body.appendChild(script);
});
