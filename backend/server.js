const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

// ─── Validate required env vars on startup ─────────────────────────────────
if (!process.env.STRIPE_SECRET_KEY) {
    console.error('[wandernear-backend] FATAL: STRIPE_SECRET_KEY is not set. Exiting.');
    process.exit(1);
}

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();

// ─── CORS ──────────────────────────────────────────────────────────────────
// Allow requests from any Netlify deploy preview AND the production domain.
// Set ALLOWED_ORIGINS in Render env vars, comma-separated.
// e.g. ALLOWED_ORIGINS=https://wandernear.netlify.app,https://preview--wandernear.netlify.app
const rawOrigins = process.env.ALLOWED_ORIGINS || '';
const allowedOrigins = rawOrigins
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (curl, Postman, server-to-server)
        if (!origin) return callback(null, true);

        // Always allow localhost for local dev
        if (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
            return callback(null, true);
        }

        if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
            return callback(null, true);
        }

        console.warn(`[CORS] Blocked origin: ${origin}`);
        callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
}));

app.use(express.json());

// ─── Health check ──────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'wandernear-backend', timestamp: new Date().toISOString() });
});

// ─── Stripe checkout session ────────────────────────────────────────────────
app.post('/api/create-checkout-session', async (req, res) => {
    try {
        const { budget } = req.body;

        if (!budget || isNaN(Number(budget)) || Number(budget) <= 0) {
            return res.status(400).json({ error: 'A valid numeric budget is required.' });
        }

        // Stripe amounts are in the smallest currency unit.
        // INR → paisa (1 INR = 100 paisa)
        const amountInPaisa = Math.round(Number(budget) * 100);

        // Minimum Stripe charge for INR is ₹0.50 (50 paisa)
        if (amountInPaisa < 50) {
            return res.status(400).json({ error: 'Budget must be at least ₹0.50.' });
        }

        // Determine the frontend base URL for success/cancel redirects.
        // Use FRONTEND_URL env var (set on Render) or fall back to the request origin.
        const frontendBase =
            process.env.FRONTEND_URL ||
            req.headers.origin ||
            'http://localhost:5173';

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: 'inr',
                        product_data: {
                            name: 'WanderNear Trip Plan',
                            description: `Budget-based trip itinerary – ₹${Number(budget).toFixed(2)}`,
                        },
                        unit_amount: amountInPaisa,
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment',
            success_url: `${frontendBase}/trip-planner.html?payment=success`,
            cancel_url:  `${frontendBase}/trip-planner.html?payment=cancelled`,
        });

        console.log(`[Stripe] Session created: ${session.id} for ₹${budget}`);
        res.json({ id: session.id, url: session.url });

    } catch (error) {
        console.error('[Stripe] Error creating checkout session:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ─── 404 catch-all ────────────────────────────────────────────────────────
app.use((_req, res) => {
    res.status(404).json({ error: 'Not found. This is the WanderNear API server.' });
});

// ─── Start ────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`[wandernear-backend] Listening on port ${PORT}`);
    console.log(`[wandernear-backend] Allowed origins: ${allowedOrigins.join(', ') || '(all — no ALLOWED_ORIGINS set)'}`);
});
