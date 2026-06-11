const express = require('express')
const { requireAuth } = require('../middleware/auth')
const { listMemories, upsertMemory, deleteMemory } = require('../services/memoryService')

const router = express.Router()

router.get('/', requireAuth, async (req, res) => {
  try {
    const memories = await listMemories(req.auth.sub)
    return res.json({ memories })
  } catch (err) {
    console.error('list memory:', err.message)
    return res.status(500).json({ error: 'Failed to load memories' })
  }
})

router.post('/', requireAuth, async (req, res) => {
  try {
    const memory = await upsertMemory(req.auth.sub, {
      memory_type: req.body.memory_type,
      key: req.body.key,
      value: req.body.value,
    })
    return res.status(201).json({ memory })
  } catch (err) {
    if (err.message === 'Invalid memory_type' || err.message === 'key is required') {
      return res.status(400).json({ error: err.message })
    }
    console.error('save memory:', err.message)
    return res.status(500).json({ error: 'Failed to save memory' })
  }
})

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const ok = await deleteMemory(req.auth.sub, req.params.id)
    if (!ok) return res.status(404).json({ error: 'Memory not found' })
    return res.json({ ok: true })
  } catch (err) {
    console.error('delete memory:', err.message)
    return res.status(500).json({ error: 'Failed to delete memory' })
  }
})

module.exports = { memoryRouter: router }
