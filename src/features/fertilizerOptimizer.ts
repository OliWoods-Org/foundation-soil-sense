/**
 * FertilizerOptimizer — Minimize fertilizer cost and environmental
 * runoff while maximizing crop yield for smallholder farms.
 */

import { z } from 'zod';

export const FertilizerPlanSchema = z.object({
  fieldId: z.string(), generatedAt: z.string().datetime(),
  crop: z.string(), fieldSizeHectares: z.number().positive(),
  currentNPK: z.object({ n: z.number(), p: z.number(), k: z.number() }),
  targetNPK: z.object({ n: z.number(), p: z.number(), k: z.number() }),
  applications: z.array(z.object({
    timing: z.enum(['pre_planting', 'at_planting', 'early_growth', 'mid_season', 'pre_harvest']),
    product: z.string(), npkRatio: z.string(),
    rateKgPerHectare: z.number().positive(), totalKg: z.number().positive(),
    estimatedCostUSD: z.number().nonnegative(), method: z.enum(['broadcast', 'band', 'foliar', 'drip']),
  })),
  totalCostUSD: z.number(), estimatedYieldIncrease: z.number().min(0).max(500).describe('Percentage'),
  environmentalScore: z.object({
    runoffRisk: z.enum(['low', 'moderate', 'high']),
    leachingRisk: z.enum(['low', 'moderate', 'high']),
    soilAcidificationRisk: z.enum(['low', 'moderate', 'high']),
    organicAlternatives: z.array(z.string()),
  }),
});

export const CarbonEstimateSchema = z.object({
  fieldId: z.string(), estimatedAt: z.string().datetime(),
  fieldSizeHectares: z.number(), soilType: z.string(),
  currentPractices: z.array(z.enum(['cover_crops', 'no_till', 'composting', 'crop_rotation', 'agroforestry', 'mulching', 'biochar', 'none'])),
  annualSequestrationTonsCO2: z.number(), potentialWithImprovements: z.number(),
  creditValueUSD: z.number(), certificationOptions: z.array(z.string()),
});

export type FertilizerPlan = z.infer<typeof FertilizerPlanSchema>;
export type CarbonEstimate = z.infer<typeof CarbonEstimateSchema>;

const CROP_NPK_NEEDS: Record<string, { n: number; p: number; k: number }> = {
  'maize': { n: 150, p: 50, k: 80 }, 'rice': { n: 120, p: 40, k: 60 },
  'wheat': { n: 120, p: 45, k: 50 }, 'tomatoes': { n: 180, p: 80, k: 200 },
  'beans': { n: 30, p: 60, k: 60 }, 'coffee': { n: 200, p: 30, k: 180 },
  'cassava': { n: 60, p: 30, k: 120 }, 'potato': { n: 150, p: 60, k: 200 },
};

export function optimizeFertilizer(
  crop: string, fieldSizeHa: number, currentNPK: { n: number; p: number; k: number },
  soilTexture: string, budget?: number
): FertilizerPlan {
  const target = CROP_NPK_NEEDS[crop.toLowerCase()] ?? { n: 100, p: 40, k: 80 };
  const deficit = { n: Math.max(0, target.n - currentNPK.n), p: Math.max(0, target.p - currentNPK.p), k: Math.max(0, target.k - currentNPK.k) };

  const applications: FertilizerPlan['applications'] = [];

  if (deficit.n > 0) {
    const ureaKg = (deficit.n / 0.46) * fieldSizeHa;
    applications.push({
      timing: 'at_planting', product: 'Urea (46-0-0)', npkRatio: '46-0-0',
      rateKgPerHectare: deficit.n / 0.46, totalKg: Math.round(ureaKg),
      estimatedCostUSD: Math.round(ureaKg * 0.45), method: 'band',
    });
  }
  if (deficit.p > 0) {
    const dapKg = (deficit.p / 0.46) * fieldSizeHa;
    applications.push({
      timing: 'pre_planting', product: 'DAP (18-46-0)', npkRatio: '18-46-0',
      rateKgPerHectare: deficit.p / 0.46, totalKg: Math.round(dapKg),
      estimatedCostUSD: Math.round(dapKg * 0.55), method: 'broadcast',
    });
  }
  if (deficit.k > 0) {
    const mopKg = (deficit.k / 0.60) * fieldSizeHa;
    applications.push({
      timing: 'at_planting', product: 'MOP (0-0-60)', npkRatio: '0-0-60',
      rateKgPerHectare: deficit.k / 0.60, totalKg: Math.round(mopKg),
      estimatedCostUSD: Math.round(mopKg * 0.40), method: 'band',
    });
  }

  const totalCost = applications.reduce((s, a) => s + a.estimatedCostUSD, 0);
  const sandySoil = soilTexture.includes('sand');

  return {
    fieldId: crypto.randomUUID(), generatedAt: new Date().toISOString(),
    crop, fieldSizeHectares: fieldSizeHa, currentNPK, targetNPK: target,
    applications, totalCostUSD: totalCost,
    estimatedYieldIncrease: Math.min(100, (deficit.n + deficit.p + deficit.k) / 5),
    environmentalScore: {
      runoffRisk: sandySoil ? 'high' : 'moderate',
      leachingRisk: sandySoil ? 'high' : 'low',
      soilAcidificationRisk: deficit.n > 100 ? 'moderate' : 'low',
      organicAlternatives: ['Compost (2-3 tons/ha)', 'Green manure cover crop', 'Bone meal for phosphorus', 'Wood ash for potassium'],
    },
  };
}

export function estimateCarbonSequestration(
  fieldSizeHa: number, soilType: string,
  practices: CarbonEstimate['currentPractices']
): CarbonEstimate {
  const baseRate = 0.5; // tons CO2/ha/year baseline
  let multiplier = 1.0;

  if (practices.includes('no_till')) multiplier += 0.4;
  if (practices.includes('cover_crops')) multiplier += 0.3;
  if (practices.includes('composting')) multiplier += 0.3;
  if (practices.includes('agroforestry')) multiplier += 0.8;
  if (practices.includes('biochar')) multiplier += 0.6;
  if (practices.includes('crop_rotation')) multiplier += 0.2;
  if (practices.includes('mulching')) multiplier += 0.2;

  const annual = fieldSizeHa * baseRate * multiplier;
  const potential = fieldSizeHa * baseRate * (multiplier + 1.5);
  const creditValue = annual * 25; // ~$25/ton CO2e

  return {
    fieldId: crypto.randomUUID(), estimatedAt: new Date().toISOString(),
    fieldSizeHectares: fieldSizeHa, soilType, currentPractices: practices,
    annualSequestrationTonsCO2: Math.round(annual * 10) / 10,
    potentialWithImprovements: Math.round(potential * 10) / 10,
    creditValueUSD: Math.round(creditValue), certificationOptions: ['Verra VCS', 'Gold Standard', 'Plan Vivo', 'Nori'],
  };
}
