// preview.js

// Load stored HTML
let raw = localStorage.getItem("codeMonGenerated");

if (!raw) {
    document.body.innerHTML = "<h2>No preview data found.</h2>";
    throw new Error("No data in localStorage");
}

// Fix relative paths for images
raw = raw.replace(/src="img\//g, 'src="./img/')
         .replace(/href="img\//g, 'href="./img/');

// Clear the body
document.body.innerHTML = "";

// -------------------------------
// 1. INJECT HEAD ELEMENTS (styles & link)
// -------------------------------
const headMatch = raw.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
if (headMatch) {
    const headContent = headMatch[1];

    // Inline styles
    [...headContent.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].forEach(match => {
        const style = document.createElement("style");
        style.textContent = match[1];
        document.head.appendChild(style);
    });

    // External stylesheets
    [...headContent.matchAll(/<link[^>]+href="([^"]+)"[^>]*>/gi)].forEach(match => {
        const href = match[1];
        const linkEl = document.createElement("link");
        linkEl.rel = "stylesheet";
        // Fix relative path
        linkEl.href = href.startsWith("http") ? href : "./" + href.replace(/^\/?/, "");
        document.head.appendChild(linkEl);
    });
}

// -------------------------------
// 2. INJECT BODY CONTENT
// -------------------------------
const bodyMatch = raw.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
const bodyContent = bodyMatch ? bodyMatch[1] : "";
const container = document.createElement("div");
container.innerHTML = bodyContent;
document.body.appendChild(container);

// -------------------------------
// 3. EXECUTE INLINE SCRIPTS
// -------------------------------
[...raw.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].forEach(match => {
    if (match[0].includes("src=")) return; // skip external
    const script = document.createElement("script");
    script.textContent = match[1];
    document.body.appendChild(script);
});

// -------------------------------
// 4. LOAD EXTERNAL SCRIPTS
// -------------------------------
[...raw.matchAll(/<script[^>]+src="([^"]+)"[^>]*><\/script>/gi)].forEach(match => {
    const src = match[1];
    const script = document.createElement("script");
    script.src = src;
    script.defer = true; // ensure DOM is ready
    document.body.appendChild(script);
});

// -------------------------------
// 5. RENDER BASE64 IMAGES (from textareas if any)
// -------------------------------
document.querySelectorAll("textarea").forEach(textarea => {
    const content = textarea.value.trim();
    if (content.startsWith("data:image/")) {
        const img = document.createElement("img");
        img.src = content;
        img.style.maxWidth = "100%";
        img.style.display = "block";
        textarea.parentNode.replaceChild(img, textarea);
    }
});
