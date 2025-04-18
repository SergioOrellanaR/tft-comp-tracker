export default async (req) => {
    const NETLIFY_API_KEY = Netlify.env.get("API_KEY");

    if (!NETLIFY_API_KEY) {
        return new Response("API key not configured", { status: 500 });
    }

    // Parsear parámetros
    const { url, method = "GET", body } = await req.json();

    if (!url || !url.startsWith("https://")) {
        return new Response("Invalid or missing URL", { status: 400 });
    }

    // Agregar api_key como query param
    const urlWithKey = new URL(url);
    urlWithKey.searchParams.set("api_key", NETLIFY_API_KEY);

    try {
        const response = await fetch(urlWithKey.toString(), {
            method,
            headers: {
                "Content-Type": "application/json",
            },
            body: method === "POST" ? JSON.stringify(body) : undefined,
        });

        const contentType = response.headers.get("content-type");
        const result = contentType?.includes("application/json")
            ? await response.json()
            : await response.text();

        return new Response(JSON.stringify(result), {
            status: response.status,
            headers: { "Content-Type": "application/json" },
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
};