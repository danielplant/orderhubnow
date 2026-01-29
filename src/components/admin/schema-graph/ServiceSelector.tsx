'use client'

import { useEffect, useState } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface ServiceSelectorProps {
  value: string | null
  onChange: (service: string | null) => void
}

export function ServiceSelector({ value, onChange }: ServiceSelectorProps) {
  const [services, setServices] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchServices() {
      try {
        const res = await fetch('/api/admin/shopify/schema/services')
        const data = await res.json()
        if (data.success) {
          setServices(data.services)
        }
      } catch (err) {
        console.error('Failed to fetch services:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchServices()
  }, [])

  return (
    <Select
      value={value ?? 'all'}
      onValueChange={(v) => onChange(v === 'all' ? null : v)}
      disabled={loading}
    >
      <SelectTrigger className="w-[200px]">
        <SelectValue placeholder={loading ? 'Loading...' : 'Select service'} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All Services</SelectItem>
        {services.map((service) => (
          <SelectItem key={service} value={service}>
            {service}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
