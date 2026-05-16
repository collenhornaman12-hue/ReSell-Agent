import { describe, it, expect } from 'vitest'
import { getCategoryGroup, mapConditionEbay } from './condition-map'

describe('getCategoryGroup', () => {
  it('maps Toys & Hobbies to CT', () => {
    expect(getCategoryGroup('Toys & Hobbies')).toBe('CT')
  })
  it('maps Collectibles to CT', () => {
    expect(getCategoryGroup('Collectibles')).toBe('CT')
  })
  it('maps Entertainment Memorabilia to CT', () => {
    expect(getCategoryGroup('Entertainment Memorabilia')).toBe('CT')
  })
  it('maps Other to CT', () => {
    expect(getCategoryGroup('Other')).toBe('CT')
  })
  it('unknown category defaults to CT', () => {
    expect(getCategoryGroup('Furniture')).toBe('CT')
  })
  it('maps Sports Memorabilia to SM', () => {
    expect(getCategoryGroup('Sports Memorabilia')).toBe('SM')
  })
  it('maps Books & Media to BM', () => {
    expect(getCategoryGroup('Books & Media')).toBe('BM')
  })
})

describe('mapConditionEbay', () => {
  it('Mint + CT + complete → New', () => {
    expect(mapConditionEbay('Mint', 'Collectibles', true)).toBe('New')
  })
  it('Mint + CT + incomplete → Like New', () => {
    expect(mapConditionEbay('Mint', 'Collectibles', false)).toBe('Like New')
  })
  it('Mint + Toys & Hobbies + complete → New', () => {
    expect(mapConditionEbay('Mint', 'Toys & Hobbies', true)).toBe('New')
  })
  it('Mint + Entertainment Memorabilia + complete → New (CT group)', () => {
    expect(mapConditionEbay('Mint', 'Entertainment Memorabilia', true)).toBe('New')
  })
  it('Mint + SM + complete → Mint', () => {
    expect(mapConditionEbay('Mint', 'Sports Memorabilia', true)).toBe('Mint')
  })
  it('Mint + SM + incomplete → Mint (SM ignores completeness)', () => {
    expect(mapConditionEbay('Mint', 'Sports Memorabilia', false)).toBe('Mint')
  })
  it('Mint + BM + complete → Brand New', () => {
    expect(mapConditionEbay('Mint', 'Books & Media', true)).toBe('Brand New')
  })
  it('Mint + BM + incomplete → Like New', () => {
    expect(mapConditionEbay('Mint', 'Books & Media', false)).toBe('Like New')
  })
  it('VeryGood + CT → Very Good', () => {
    expect(mapConditionEbay('VeryGood', 'Toys & Hobbies', true)).toBe('Very Good')
  })
  it('VeryGood + SM → Near Mint', () => {
    expect(mapConditionEbay('VeryGood', 'Sports Memorabilia', true)).toBe('Near Mint')
  })
  it('VeryGood + BM → Very Good', () => {
    expect(mapConditionEbay('VeryGood', 'Books & Media', true)).toBe('Very Good')
  })
  it('Good + CT → Good', () => {
    expect(mapConditionEbay('Good', 'Collectibles', true)).toBe('Good')
  })
  it('Good + SM → Excellent', () => {
    expect(mapConditionEbay('Good', 'Sports Memorabilia', true)).toBe('Excellent')
  })
  it('Good + BM → Good', () => {
    expect(mapConditionEbay('Good', 'Books & Media', true)).toBe('Good')
  })
  it('Fair + CT → Acceptable', () => {
    expect(mapConditionEbay('Fair', 'Collectibles', true)).toBe('Acceptable')
  })
  it('Fair + SM → Very Good', () => {
    expect(mapConditionEbay('Fair', 'Sports Memorabilia', true)).toBe('Very Good')
  })
  it('Fair + BM → Acceptable', () => {
    expect(mapConditionEbay('Fair', 'Books & Media', true)).toBe('Acceptable')
  })
  it('Poor + CT → For parts or not working', () => {
    expect(mapConditionEbay('Poor', 'Collectibles', true)).toBe('For parts or not working')
  })
  it('Poor + SM → Good', () => {
    expect(mapConditionEbay('Poor', 'Sports Memorabilia', true)).toBe('Good')
  })
  it('Poor + BM → Poor', () => {
    expect(mapConditionEbay('Poor', 'Books & Media', true)).toBe('Poor')
  })
  it('unknown condition_raw defaults to Good row for CT', () => {
    expect(mapConditionEbay('Unknown', 'Collectibles', true)).toBe('Good')
  })
})
