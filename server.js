const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
app.use(cors());
app.use(express.static('.')); // Serve static files from current directory
app.use(express.json());

app.post('/api/create-checkout-session', async (req, res) => {
    try {
        const { budget } = req.body;

        if (!budget || isNaN(budget) || budget <= 0) {
            return res.status(400).json({ error: 'Valid budget is required' });
        }

        if (!process.env.STRIPE_SECRET_KEY) {
            return res.status(500).json({ error: 'Stripe secret key is not configured' });
        }

        // Stripe requires amount in smallest currency unit (e.g., paisa for INR, cents for USD)
        // Assuming INR since budget is presented with ₹
        const amountInPaisa = Math.round(budget * 100);

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: 'inr',
                        product_data: {
                            name: 'WanderNear Trip Plan',
                            description: 'Budget-based trip planner itinerary fee',
                        },
                        unit_amount: amountInPaisa,
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment',
            // Redirect URLs after successful/failed payment
            // We use the referrer URL or local dev server
            success_url: `${req.headers.origin || 'http://localhost:5173'}/trip-planner.html?payment=success`,
            cancel_url: `${req.headers.origin || 'http://localhost:5173'}/trip-planner.html`,
        });

        res.json({ id: session.id, url: session.url });
    } catch (error) {
        console.error('Error creating checkout session:', error);
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
