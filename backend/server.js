require('dotenv').config()
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')
const { authRouter } = require('./routes/auth')
const { businessesRouter } = require('./routes/businesses')
const { scansRouter } = require('./routes/scans')
const { actionsRouter } = require('./routes/actions')
const { aiRouter } = require('./routes/ai')
const { memoryRouter } = require('./routes/memory')
const { researchRouter } = require('./routes/research')
const { crawlsRouter } = require('./routes/crawls')

const app = express()

const allowedOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173'

app.set('trust proxy', 1)
app.use(helmet())
app.use(
  cors({
    origin: allowedOrigin,
    credentials: false,
  }),
)
app.use(express.json({ limit: '32kb' }))

// Global gate to reduce request floods before they hit routes/db.
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please slow down.' },
  }),
)

app.get('/api/health', async (_req, res) => {
  try {
    const { pool } = require('./db')
    await pool.query('SELECT 1')
    res.json({ ok: true, db: 'connected' })
  } catch (err) {
    res.status(503).json({ ok: false, db: 'error', message: err.message })
  }
})

app.use('/api/auth', authRouter)
app.use('/api/businesses', businessesRouter)
app.use('/api/scans', scansRouter)
app.use('/api/actions', actionsRouter)
app.use('/api/ai', aiRouter)
app.use('/api/memory', memoryRouter)
app.use('/api/research', researchRouter)
app.use('/api', crawlsRouter)

app.use((err, _req, res, _next) => {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      error: 'Request payload too large. Sync the growth plan using business_id only — do not send the full report.',
    })
  }
  console.error(err)
  res.status(500).json({ error: 'Unexpected server error' })
})

const port = Number(process.env.PORT || 3001)
app.listen(port, () => {
  console.log(`Server is running on port ${port}`)
})
