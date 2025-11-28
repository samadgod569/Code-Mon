export default {
  async fetch(req) {
    return new Response("Worker deployed successfully!", {
      headers: { "content-type": "text/plain" }
    });
  }
};
