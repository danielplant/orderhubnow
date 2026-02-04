'use client'

import * as React from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScenariosTab } from './components/scenarios-tab'
import { DataSourcesTab } from './components/data-sources-tab'
import { DisplayMatrixTab } from './components/display-matrix-tab'
import { PreviewTab } from './components/preview-tab'

export interface CalculatedField {
  id: number
  name: string
  formula: string
  description: string | null
  isSystem: boolean
}

export interface DisplayRule {
  id: number
  scenario: string
  view: string
  fieldSource: string
  label: string
  rowBehavior: string
}

export function DisplayRulesClient() {
  const [activeTab, setActiveTab] = React.useState('scenarios')
  const [calculatedFields, setCalculatedFields] = React.useState<CalculatedField[]>([])
  const [displayRules, setDisplayRules] = React.useState<DisplayRule[]>([])
  const [isLoading, setIsLoading] = React.useState(true)

  // Load data on mount
  React.useEffect(() => {
    async function loadData() {
      setIsLoading(true)
      try {
        const [fieldsRes, rulesRes] = await Promise.all([
          fetch('/api/admin/calculated-fields'),
          fetch('/api/admin/display-rules'),
        ])

        if (fieldsRes.ok) {
          const { fields } = await fieldsRes.json()
          setCalculatedFields(fields)
        }

        if (rulesRes.ok) {
          const { rules } = await rulesRes.json()
          setDisplayRules(rules)
        }
      } catch (err) {
        console.error('Failed to load display rules data:', err)
      } finally {
        setIsLoading(false)
      }
    }

    loadData()
  }, [])

  const refreshFields = async () => {
    try {
      const res = await fetch('/api/admin/calculated-fields')
      if (res.ok) {
        const { fields } = await res.json()
        setCalculatedFields(fields)
      }
    } catch (err) {
      console.error('Failed to refresh calculated fields:', err)
    }
  }

  const refreshRules = async () => {
    try {
      const res = await fetch('/api/admin/display-rules')
      if (res.ok) {
        const { rules } = await res.json()
        setDisplayRules(rules)
      }
    } catch (err) {
      console.error('Failed to refresh display rules:', err)
    }
  }

  if (isLoading) {
    return <div className="text-muted-foreground">Loading display rules...</div>
  }

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="scenarios">1. Scenarios</TabsTrigger>
        <TabsTrigger value="data-sources">2. Data Sources</TabsTrigger>
        <TabsTrigger value="matrix">3. Display Matrix</TabsTrigger>
        <TabsTrigger value="preview">4. Preview</TabsTrigger>
      </TabsList>

      <TabsContent value="scenarios" className="space-y-4">
        <ScenariosTab />
      </TabsContent>

      <TabsContent value="data-sources" className="space-y-4">
        <DataSourcesTab 
          calculatedFields={calculatedFields} 
          onRefresh={refreshFields} 
        />
      </TabsContent>

      <TabsContent value="matrix" className="space-y-4">
        <DisplayMatrixTab 
          displayRules={displayRules}
          calculatedFields={calculatedFields}
          onRefresh={refreshRules}
        />
      </TabsContent>

      <TabsContent value="preview" className="space-y-4">
        <PreviewTab 
          displayRules={displayRules}
          calculatedFields={calculatedFields}
        />
      </TabsContent>
    </Tabs>
  )
}
