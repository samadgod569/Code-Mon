addEventListener("fetch", event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const url = new URL(request.url)
  // serve / as /index.html
  let path = url.pathname === "/" ? "/index.html" : url.pathname
  // fetch the file from your GitHub public folder
  const file = await fetch(`https://raw.githubusercontent.com/samadgod569/Code-Mon/main/public${path}`)
  // return the content with html content-type
  return new Response(await file.text(), { headers: { "content-type": "text/html" } })
}
