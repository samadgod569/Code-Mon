// LOAD STORED HTML
let raw = localStorage.getItem("codeMonGenerated");

if (!raw) {
    document.body.innerHTML = "<h2>No preview data found.</h2>";
    throw new Error("No data in localStorage");
}

// -------------------------------
// 1. EXTRACT BODY CONTENT
// -------------------------------
let bodyMatch = raw.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
let bodyContent = bodyMatch ? bodyMatch[1] : "";

// Insert body content into page
document.body.innerHTML = bodyContent;


// -------------------------------
// 2. EXTRACT AND INJECT STYLES
// -------------------------------
let styleMatches = [...raw.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)];

styleMatches.forEach(match => {
    let style = document.createElement("style");
    style.textContent = match[1];
    document.head.appendChild(style);
});


// -------------------------------
// 3. EXTRACT AND EXECUTE SCRIPTS
// -------------------------------
let scriptMatches = [...raw.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)];

scriptMatches.forEach(match => {
    let script = document.createElement("script");
    script.textContent = match[1];
    document.body.appendChild(script);
});
