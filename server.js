require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@libsql/client');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
    console.error(
        'Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN. Copy .env.example to .env and fill in your Turso credentials.'
    );
    process.exit(1);
}

const turso = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN
});

async function initSchema() {
    await turso.execute(`
        CREATE TABLE IF NOT EXISTS activities (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            type TEXT NOT NULL,
            merchant_name TEXT NOT NULL,
            area TEXT NOT NULL,
            address TEXT,
            orders INTEGER DEFAULT 0,
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
}

function mapRow(row) {
    return {
        id: row.id,
        userId: row.user_id,
        date: row.date,
        type: row.type,
        merchantName: row.merchant_name,
        area: row.area,
        address: row.address,
        orders: row.orders,
        notes: row.notes,
        createdAt: row.created_at
    };
}

// GET /api/activities?userIds=1,2,3
// If userIds is omitted, returns everything — the frontend always sends it,
// scoped to whichever users the logged-in person is allowed to see.
app.get('/api/activities', async (req, res) => {
    try {
        const { userIds } = req.query;
        let result;

        if (userIds) {
            const ids = userIds
                .split(',')
                .map(Number)
                .filter(Number.isFinite);

            if (ids.length === 0) return res.json([]);

            const placeholders = ids.map(() => '?').join(',');
            result = await turso.execute({
                sql: `SELECT * FROM activities WHERE user_id IN (${placeholders}) ORDER BY date DESC, id DESC`,
                args: ids
            });
        } else {
            result = await turso.execute('SELECT * FROM activities ORDER BY date DESC, id DESC');
        }

        res.json(result.rows.map(mapRow));
    } catch (err) {
        console.error('GET /api/activities failed:', err);
        res.status(500).json({ error: 'Failed to fetch activities' });
    }
});

// POST /api/activities
app.post('/api/activities', async (req, res) => {
    try {
        const { userId, date, type, merchantName, area, address, orders, notes } = req.body;

        if (!userId || !date || !type || !merchantName || !area) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const insertResult = await turso.execute({
            sql: `INSERT INTO activities (user_id, date, type, merchant_name, area, address, orders, notes)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
                userId,
                date,
                type,
                merchantName,
                area,
                address || '',
                Number.isFinite(orders) ? orders : 0,
                notes || ''
            ]
        });

        const inserted = await turso.execute({
            sql: 'SELECT * FROM activities WHERE id = ?',
            args: [Number(insertResult.lastInsertRowid)]
        });

        res.status(201).json(mapRow(inserted.rows[0]));
    } catch (err) {
        console.error('POST /api/activities failed:', err);
        res.status(500).json({ error: 'Failed to save activity' });
    }
});

// GET /api/health — quick way to confirm the server (and Turso) is actually
// reachable, useful when debugging blank/odd responses from the client.
app.get('/api/health', async (req, res) => {
    try {
        await turso.execute('SELECT 1');
        res.json({ status: 'ok', turso: 'connected' });
    } catch (err) {
        console.error('Health check failed:', err);
        res.status(500).json({ status: 'error', error: err.message });
    }
});

// Any /api/* route that didn't match above (wrong method, typo, etc.)
// still gets a JSON response instead of Express's default HTML 404 page.
app.use('/api', (req, res) => {
    res.status(404).json({ error: `No API route for ${req.method} ${req.originalUrl}` });
});

// Central error handler — guarantees every failure (including malformed
// JSON request bodies, or anything thrown outside a route's own try/catch)
// comes back as JSON with a real status code, never an empty or HTML body.
// That's what causes the frontend's "Unexpected end of JSON input" error.
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    if (res.headersSent) return next(err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 3000;

initSchema()
    .then(() => {
        app.listen(PORT, () => console.log(`FieldForce server running on http://localhost:${PORT}`));
    })
    .catch(err => {
        console.error('Failed to initialize Turso schema:', err);
        process.exit(1);
    });
