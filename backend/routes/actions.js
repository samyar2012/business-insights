const express = require('express')
const { requireAuth } = require('../middleware/auth')
const {
  listActions,
  createAction,
  updateAction,
  createFixPlanFromReport,
} = require('../services/actionPlanService')

const router = express.Router()

router.get('/', requireAuth, async (req, res) => {
  try {
    const actions = await listActions(req.auth.sub, {
      status: req.query.status,
      business_id: req.query.business_id,
    })
    return res.json({ actions })
  } catch (err) {
    console.error('list actions:', err.message)
    return res.status(500).json({ error: 'Failed to load actions' })
  }
})

router.post('/fix-plan', requireAuth, async (req, res) => {
  try {
    const result = await createFixPlanFromReport(req.auth.sub, req.body)
    if (result.error === 'no_fixes') {
      return res.status(400).json({ error: result.message })
    }
    return res.status(201).json(result)
  } catch (err) {
    if (err.message === 'business_id is required' || err.message.startsWith('Invalid')) {
      return res.status(400).json({ error: err.message })
    }
    console.error('create fix plan:', err.message)
    return res.status(500).json({ error: 'Failed to create fix plan' })
  }
})

router.post('/', requireAuth, async (req, res) => {
  try {
    const action = await createAction(req.auth.sub, req.body)
    return res.status(201).json({ action })
  } catch (err) {
    if (err.message === 'title is required' || err.message.startsWith('Invalid')) {
      return res.status(400).json({ error: err.message })
    }
    console.error('create action:', err.message)
    return res.status(500).json({ error: 'Failed to create action' })
  }
})

router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const action = await updateAction(req.auth.sub, req.params.id, req.body)
    if (!action) return res.status(404).json({ error: 'Action not found' })
    return res.json({ action })
  } catch (err) {
    if (err.message.startsWith('Invalid')) {
      return res.status(400).json({ error: err.message })
    }
    console.error('update action:', err.message)
    return res.status(500).json({ error: 'Failed to update action' })
  }
})

module.exports = { actionsRouter: router }
