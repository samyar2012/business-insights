require('dotenv').config()
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')
const { authRouter } = require('./routes/auth')

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

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.use('/api/auth', authRouter)

app.use((err, _req, res, _next) => {
  console.error(err)
  res.status(500).json({ error: 'Unexpected server error' })
})

const port = Number(process.env.PORT || 3001)
app.listen(port, () => {
  console.log(`Server is running on port ${port}`)
})
