// Load saved code
let raw = localStorage.getItem("codeMonGenerated");

if (!raw) {
    document.body.innerHTML = "<h2>No preview data found.</h2>";
} else {
    // Extract BODY content
    let bodyContent = "";
    let scriptContent = "";

    // Match the contents between <body>...</body>
    let bodyMatch = raw.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch) {
        bodyContent = bodyMatch[1];
    }

    // Match ALL <script>...</script> blocks
    let scriptMatch = raw.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
    if (scriptMatch) {
        scriptContent = scriptMatch[1];
    }

    // Inject BODY content
    document.body.innerHTML = bodyContent + `
        <script src="preview.js"></script>
        <script id="injected-script"></script>
    `;

    // Inject JS inside second script tag
    let injected = document.getElementById("injected-script");
    injected.textContent = scriptContent;
}
