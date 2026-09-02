import type { OwnershipLinkInput } from './types'

/**
 * The structure behind the "Load example" button, and the basis of the engine
 * tests. Masood 25% direct, plus Husain and Dinesh 50/50 of XYZ Ltd which holds
 * 75% of ABC LTD.
 */
export const SAMPLE_LINKS: OwnershipLinkInput[] = [
  {
    id: 'sample-1',
    ownerName: 'Masood',
    ownerType: 'individual',
    ownerIsController: false,
    percent: 25,
    entityName: 'ABC LTD',
  },
  {
    id: 'sample-2',
    ownerName: 'XYZ Ltd',
    ownerType: 'company',
    ownerIsController: false,
    percent: 75,
    entityName: 'ABC LTD',
  },
  {
    id: 'sample-3',
    ownerName: 'Husain',
    ownerType: 'individual',
    ownerIsController: false,
    percent: 50,
    entityName: 'XYZ Ltd',
  },
  {
    id: 'sample-4',
    ownerName: 'Dinesh',
    ownerType: 'individual',
    ownerIsController: false,
    percent: 50,
    entityName: 'XYZ Ltd',
  },
]
