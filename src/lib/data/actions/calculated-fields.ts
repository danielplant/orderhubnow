'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { isCalculatedFieldNameTaken } from '@/lib/data/queries/calculated-fields'
import { validateFormula } from '@/lib/availability/formula-evaluator'

export interface CreateCalculatedFieldInput {
  name: string
  formula: string
  description?: string
}

export async function createCalculatedField(
  input: CreateCalculatedFieldInput
): Promise<{ success: boolean; id?: number; error?: string }> {
  try {
    // Validate name
    if (!input.name || input.name.trim().length === 0) {
      return { success: false, error: 'Name is required' }
    }

    const name = input.name.trim().toLowerCase().replace(/\s+/g, '_')
    
    // Check if name is taken
    if (await isCalculatedFieldNameTaken(name)) {
      return { success: false, error: 'A field with this name already exists' }
    }

    // Validate formula
    const formulaValidation = validateFormula(input.formula)
    if (!formulaValidation.valid) {
      return { success: false, error: formulaValidation.error }
    }

    const field = await prisma.calculatedField.create({
      data: {
        name,
        formula: input.formula.trim(),
        description: input.description?.trim() || null,
        isSystem: false,
      },
    })

    revalidatePath('/admin/business/display-rules')

    return { success: true, id: field.id }
  } catch (err) {
    console.error('Error creating calculated field:', err)
    return { success: false, error: 'Failed to create calculated field' }
  }
}

export interface UpdateCalculatedFieldInput {
  name?: string
  formula?: string
  description?: string
}

export async function updateCalculatedField(
  id: number,
  input: UpdateCalculatedFieldInput
): Promise<{ success: boolean; error?: string }> {
  try {
    const existing = await prisma.calculatedField.findUnique({ where: { id } })
    
    if (!existing) {
      return { success: false, error: 'Calculated field not found' }
    }

    if (existing.isSystem) {
      return { success: false, error: 'System fields cannot be modified' }
    }

    // Validate name if provided
    if (input.name !== undefined) {
      const name = input.name.trim().toLowerCase().replace(/\s+/g, '_')
      if (await isCalculatedFieldNameTaken(name, id)) {
        return { success: false, error: 'A field with this name already exists' }
      }
    }

    // Validate formula if provided
    if (input.formula !== undefined) {
      const formulaValidation = validateFormula(input.formula)
      if (!formulaValidation.valid) {
        return { success: false, error: formulaValidation.error }
      }
    }

    await prisma.calculatedField.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name.trim().toLowerCase().replace(/\s+/g, '_') }),
        ...(input.formula !== undefined && { formula: input.formula.trim() }),
        ...(input.description !== undefined && { description: input.description.trim() || null }),
      },
    })

    revalidatePath('/admin/business/display-rules')

    return { success: true }
  } catch (err) {
    console.error('Error updating calculated field:', err)
    return { success: false, error: 'Failed to update calculated field' }
  }
}

export async function deleteCalculatedField(id: number): Promise<{ success: boolean; error?: string }> {
  try {
    const existing = await prisma.calculatedField.findUnique({ where: { id } })
    
    if (!existing) {
      return { success: false, error: 'Calculated field not found' }
    }

    if (existing.isSystem) {
      return { success: false, error: 'System fields cannot be deleted' }
    }

    // Check if field is in use by any display rules
    const inUse = await prisma.displayRule.findFirst({
      where: { fieldSource: existing.name },
    })

    if (inUse) {
      return { success: false, error: 'This field is in use by display rules and cannot be deleted' }
    }

    await prisma.calculatedField.delete({ where: { id } })

    revalidatePath('/admin/business/display-rules')

    return { success: true }
  } catch (err) {
    console.error('Error deleting calculated field:', err)
    return { success: false, error: 'Failed to delete calculated field' }
  }
}
