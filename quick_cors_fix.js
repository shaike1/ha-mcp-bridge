
// Quick CORS fix - add this near the top of your server.js after express setup

app.use((req, res, next) => {
    const origin = req.headers.origin;
    const allowedOrigins = [
        "https://claude.ai",
        "https://app.claude.ai", 
        "https://www.claude.ai"
    ];
    
    if (allowedOrigins.includes(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
    } else if (!origin) {
        res.setHeader("Access-Control-Allow-Origin", "*");
    }
    
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, User-Agent, X-Requested-With");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    
    if (req.method === "OPTIONS") {
        res.status(200).end();
        return;
    }
    
    next();
});

