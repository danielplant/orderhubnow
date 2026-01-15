'use client'

import { useRouter, useSearchParams } from 'next/navigation'

interface FeatureFilterProps {
  featureNames: string[]
  currentFilter?: string
}

export function FeatureFilter({ featureNames, currentFilter }: FeatureFilterProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const handleChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value) {
      params.set('feature', value)
    } else {
      params.delete('feature')
    }
    router.push(`?${params.toString()}`)
  }

  return (
    <div className="flex items-center gap-3">
      <label className="text-sm text-muted-foreground">Filter by feature:</label>
      <select
        value={currentFilter || ''}
        onChange={(e) => handleChange(e.target.value)}
        className="h-9 rounded-md border border-input bg-background px-3 text-sm"
      >
        <option value="">All Features</option>
        {featureNames.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
    </div>
  )
}
