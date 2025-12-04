// preview.js

// LOAD STORED HTML
let raw = localStorage.getItem("codeMonGenerated");

if (!raw) {
    document.body.innerHTML = "<h2>No preview data found.</h2>";
    throw new Error("No data in localStorage");
}

// -------------------------------
// 0. FIX RELATIVE PATHS FOR PREVIEW
// -------------------------------
raw = raw.replace(/src="img\//g, 'src="./img/')
         .replace(/href="img\//g, 'href="./img/');

// -------------------------------
// 1. CLEAR BODY AND CREATE PREVIEW CONTAINER
// -------------------------------
document.body.innerHTML = ""; // clear existing body
const preview = document.createElement("div");
preview.id = "previewContainer";
document.body.appendChild(preview);

// -------------------------------
// 2. EXTRACT AND INSERT BODY CONTENT
// -------------------------------
let bodyMatch = raw.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
let bodyContent = bodyMatch ? bodyMatch[1] : "";
preview.innerHTML = bodyContent;

// -------------------------------
// 3. INJECT INLINE STYLES
// -------------------------------
[...raw.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].forEach(match => {
    const style = document.createElement("style");
    style.textContent = match[1];
    document.head.appendChild(style);
});

// -------------------------------
// 4. INJECT EXTERNAL CSS (LINK TAGS)
// -------------------------------
[...raw.matchAll(/<link[^>]+href="([^"]+)"[^>]*>/gi)].forEach(match => {
    const href = match[1];

    // Fix relative paths
    const fixedHref = href.startsWith("http") ? href : "./" + href.replace(/^\/?/, "");

    const linkEl = document.createElement("link");
    linkEl.rel = "stylesheet";
    linkEl.href = fixedHref;
    document.head.appendChild(linkEl);
});

// -------------------------------
// 5. INJECT INLINE SCRIPTS
// -------------------------------
[...raw.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].forEach(match => {
    if (match[0].includes("src=")) return; // skip external
    const script = document.createElement("script");
    script.textContent = match[1];
    document.body.appendChild(script);
});

// -------------------------------
// 6. INJECT EXTERNAL SCRIPTS
// -------------------------------
[...raw.matchAll(/<script[^>]+src="([^"]+)"[^>]*><\/script>/gi)].forEach(match => {
    const src = match[1];
    const script = document.createElement("script");
    script.src = src;
    script.defer = true; // ensure scripts run after DOM is parsed
    document.body.appendChild(script);
});

// -------------------------------
// 7. RENDER BASE64 IMAGES (from <textarea> content)
// -------------------------------
document.querySelectorAll("textarea").forEach(textarea => {
    const content = textarea.value;
    if (content.startsWith("data:image/")) {
        const img = document.createElement("img");
        img.src = content;
        img.style.maxWidth = "100%";
        img.style.display = "block";
        textarea.parentNode.replaceChild(img, textarea);
    }
});
