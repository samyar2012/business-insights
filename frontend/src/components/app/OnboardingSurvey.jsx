import { useState } from 'react'

import { useNavigate } from 'react-router-dom'

import { apiFetch } from '../../lib/api'

import { EMPTY_BUSINESS_FORM, serializeBusinessForm } from '../../lib/businessFormConfig'

import BusinessProfileForm from './BusinessProfileForm'

import Alert from './Alert'



const OnboardingSurvey = ({ onComplete, redirectTo = '/app' }) => {

  const [form, setForm] = useState({ ...EMPTY_BUSINESS_FORM })

  const [error, setError] = useState('')

  const [submitting, setSubmitting] = useState(false)

  const navigate = useNavigate()



  const handleSubmit = async (e) => {

    e.preventDefault()

    setError('')

    setSubmitting(true)

    try {

      await apiFetch('/businesses/onboarding', {

        method: 'POST',

        body: JSON.stringify(serializeBusinessForm(form)),

      })

      await onComplete?.()

      navigate(redirectTo, { replace: true })

    } catch (err) {

      setError(err.message)

    } finally {

      setSubmitting(false)

    }

  }



  return (

    <div className="mx-auto max-w-2xl">

      <div className="app-card p-6 sm:p-8">

        <header>

          <p className="app-eyebrow">Welcome setup</p>

          <h2 className="app-page-title mt-2 text-2xl">Tell us about your business</h2>

          <p className="app-page-subtitle">

            Complete this once so we can personalize your dashboard, AI coach, and website analysis.

            You can edit everything later in Settings.

          </p>

        </header>



        <form onSubmit={handleSubmit} className="mt-8">

          <BusinessProfileForm form={form} onChange={setForm} disabled={submitting} />



          {error ? (

            <Alert variant="error" title="Could not save setup" className="mt-5" onDismiss={() => setError('')}>

              {error}

            </Alert>

          ) : null}



          <button

            type="submit"

            disabled={submitting}

            className="app-btn app-btn--primary app-btn--block mt-6"

          >

            {submitting ? 'Saving...' : 'Complete setup'}

          </button>

        </form>

      </div>

    </div>

  )

}



export default OnboardingSurvey

