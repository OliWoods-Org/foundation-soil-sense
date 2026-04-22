/**
 * SoilAnalyzer — Phone-based soil analysis using color, texture, and
 * environmental data to estimate NPK, pH, organic matter, and soil type.
 */

import { z } from 'zod';

export const SoilSampleSchema = z.object({
  id: z.string().uuid(), collectedAt: z.string().datetime(),
  location: z.object({ latitude: z.number(), longitude: z.number(), altitude: z.number().optional() }),
  fieldId: z.string().optional(),
  depth: z.number().positive().describe('Sample depth in cm'),
  colorRGB: z.object({ r: z.number().int().min(0).max(255), g: z.number().int().min(0).max(255), b: z.number().int().min(0).max(255) }),
  munsellColor: z.string().optional(),
  textureClass: z.enum(['sand', 'loamy_sand', 'sandy_loam', 'loam', 'silt_loam', 'silt', 'sandy_clay_loam', 'clay_loam', 'silty_clay_loam', 'sandy_clay', 'silty_clay', 'clay']),
  moistureLevel: z.enum(['dry', 'slightly_moist', 'moist', 'wet', 'saturated']),
  vegetationCover: z.enum(['none', 'sparse', 'moderate', 'dense']),
  previousCrop: z.string().optional(),
  imageUrl: z.string().optional(),
});

export const SoilAnalysisSchema = z.object({
  sampleId: z.string().uuid(), analyzedAt: z.string().datetime(),
  estimatedNPK: z.object({
    nitrogen: z.object({ level: z.enum(['very_low', 'low', 'medium', 'high', 'very_high']), estimatedPpm: z.number().nonnegative(), confidence: z.number().min(0).max(1) }),
    phosphorus: z.object({ level: z.enum(['very_low', 'low', 'medium', 'high', 'very_high']), estimatedPpm: z.number().nonnegative(), confidence: z.number().min(0).max(1) }),
    potassium: z.object({ level: z.enum(['very_low', 'low', 'medium', 'high', 'very_high']), estimatedPpm: z.number().nonnegative(), confidence: z.number().min(0).max(1) }),
  }),
  estimatedPH: z.object({ value: z.number().min(0).max(14), confidence: z.number().min(0).max(1) }),
  organicMatter: z.object({ percent: z.number().min(0).max(100), level: z.enum(['very_low', 'low', 'medium', 'high', 'very_high']), confidence: z.number().min(0).max(1) }),
  soilHealth: z.object({ score: z.number().min(0).max(100), level: z.enum(['poor', 'fair', 'good', 'excellent']), issues: z.array(z.string()), strengths: z.array(z.string()) }),
  recommendations: z.array(z.object({ priority: z.number().int(), action: z.string(), timing: z.string(), costEstimate: z.enum(['free', 'low', 'moderate', 'high']) })),
});

export const CropRecommendationSchema = z.object({
  fieldId: z.string(), generatedAt: z.string().datetime(),
  soilType: z.string(), climateZone: z.string().optional(),
  recommendations: z.array(z.object({
    crop: z.string(), suitabilityScore: z.number().min(0).max(100),
    reasons: z.array(z.string()), warnings: z.array(z.string()),
    expectedYield: z.string().optional(),
    waterRequirement: z.enum(['low', 'moderate', 'high']),
    growingSeason: z.string(),
    marketValue: z.enum(['low', 'moderate', 'high', 'premium']).optional(),
  })),
});

export type SoilSample = z.infer<typeof SoilSampleSchema>;
export type SoilAnalysis = z.infer<typeof SoilAnalysisSchema>;
export type CropRecommendation = z.infer<typeof CropRecommendationSchema>;

// Soil color to organic matter correlation (simplified Munsell)
function estimateOrganicMatterFromColor(r: number, g: number, b: number): number {
  const brightness = (r + g + b) / 3;
  // Darker soils generally have more organic matter
  if (brightness < 60) return 6.0;
  if (brightness < 90) return 4.5;
  if (brightness < 120) return 3.0;
  if (brightness < 150) return 2.0;
  if (brightness < 180) return 1.0;
  return 0.5;
}

function estimatePHFromColor(r: number, g: number, b: number): number {
  // Red-tinted soils tend to be more acidic, yellow-brown more alkaline
  const redRatio = r / (r + g + b || 1);
  if (redRatio > 0.45) return 5.5;
  if (redRatio > 0.38) return 6.0;
  return 6.8;
}

const TEXTURE_PROPERTIES: Record<string, { drainage: string; waterHolding: string; nutrientHolding: string }> = {
  sand: { drainage: 'excessive', waterHolding: 'very_low', nutrientHolding: 'very_low' },
  loam: { drainage: 'good', waterHolding: 'medium', nutrientHolding: 'medium' },
  clay: { drainage: 'poor', waterHolding: 'very_high', nutrientHolding: 'high' },
  silt_loam: { drainage: 'moderate', waterHolding: 'high', nutrientHolding: 'medium' },
  sandy_loam: { drainage: 'good', waterHolding: 'low', nutrientHolding: 'low' },
  clay_loam: { drainage: 'moderate', waterHolding: 'high', nutrientHolding: 'high' },
};

export function analyzeSoil(sample: SoilSample): SoilAnalysis {
  const om = estimateOrganicMatterFromColor(sample.colorRGB.r, sample.colorRGB.g, sample.colorRGB.b);
  const ph = estimatePHFromColor(sample.colorRGB.r, sample.colorRGB.g, sample.colorRGB.b);

  // Estimate nutrients based on organic matter and texture
  const nLevel = om > 4 ? 'high' : om > 2.5 ? 'medium' : om > 1.5 ? 'low' : 'very_low';
  const texProps = TEXTURE_PROPERTIES[sample.textureClass] ?? TEXTURE_PROPERTIES['loam'];
  const pLevel = texProps.nutrientHolding === 'high' ? 'medium' : texProps.nutrientHolding === 'medium' ? 'medium' : 'low';
  const kLevel = texProps.nutrientHolding === 'high' ? 'high' : texProps.nutrientHolding === 'medium' ? 'medium' : 'low';

  const healthScore = Math.round(om * 8 + (ph > 5.5 && ph < 7.5 ? 20 : 5) + (nLevel === 'high' ? 20 : nLevel === 'medium' ? 15 : 5) + (sample.vegetationCover === 'dense' ? 15 : 5));
  const healthLevel = healthScore >= 75 ? 'excellent' as const : healthScore >= 55 ? 'good' as const : healthScore >= 35 ? 'fair' as const : 'poor' as const;

  const issues: string[] = [];
  const strengths: string[] = [];
  if (om < 2) issues.push('Low organic matter — add compost or cover crops');
  else strengths.push(`Good organic matter (${om.toFixed(1)}%)`);
  if (ph < 5.5) issues.push('Acidic soil — consider liming');
  if (ph > 8) issues.push('Alkaline soil — consider sulfur amendment');
  if (texProps.drainage === 'poor') issues.push('Poor drainage — risk of waterlogging');
  if (texProps.drainage === 'excessive') issues.push('Excessive drainage — frequent irrigation needed');

  const recommendations: SoilAnalysis['recommendations'] = [];
  if (om < 2.5) recommendations.push({ priority: 1, action: 'Add 2-3 inches of compost', timing: 'Before planting season', costEstimate: 'low' });
  if (ph < 5.5) recommendations.push({ priority: 2, action: 'Apply agricultural lime at 2-4 tons/hectare', timing: '2-3 months before planting', costEstimate: 'moderate' });
  if (nLevel === 'low' || nLevel === 'very_low') recommendations.push({ priority: 1, action: 'Plant nitrogen-fixing cover crop (clover, beans)', timing: 'Off-season', costEstimate: 'low' });
  recommendations.push({ priority: 3, action: 'Send sample to lab for precise NPK and micronutrient analysis', timing: 'Before next planting', costEstimate: 'moderate' });

  return {
    sampleId: sample.id, analyzedAt: new Date().toISOString(),
    estimatedNPK: {
      nitrogen: { level: nLevel as any, estimatedPpm: om * 20, confidence: 0.5 },
      phosphorus: { level: pLevel as any, estimatedPpm: 15, confidence: 0.4 },
      potassium: { level: kLevel as any, estimatedPpm: 100, confidence: 0.4 },
    },
    estimatedPH: { value: Math.round(ph * 10) / 10, confidence: 0.45 },
    organicMatter: { percent: Math.round(om * 10) / 10, level: om > 4 ? 'high' : om > 2.5 ? 'medium' : om > 1.5 ? 'low' : 'very_low' as any, confidence: 0.55 },
    soilHealth: { score: Math.min(100, healthScore), level: healthLevel, issues, strengths },
    recommendations,
  };
}

export function recommendCrops(soilType: string, ph: number, organicMatter: number): CropRecommendation['recommendations'] {
  const crops = [
    { crop: 'Maize (Corn)', phRange: [5.8, 7.0], omMin: 2, water: 'moderate' as const, market: 'moderate' as const },
    { crop: 'Rice', phRange: [5.0, 6.5], omMin: 1.5, water: 'high' as const, market: 'moderate' as const },
    { crop: 'Cassava', phRange: [5.5, 6.5], omMin: 1, water: 'low' as const, market: 'low' as const },
    { crop: 'Beans', phRange: [6.0, 7.5], omMin: 2, water: 'moderate' as const, market: 'moderate' as const },
    { crop: 'Tomatoes', phRange: [6.0, 6.8], omMin: 3, water: 'moderate' as const, market: 'high' as const },
    { crop: 'Sweet Potato', phRange: [5.5, 6.5], omMin: 1.5, water: 'low' as const, market: 'moderate' as const },
    { crop: 'Coffee', phRange: [6.0, 6.5], omMin: 3, water: 'moderate' as const, market: 'premium' as const },
    { crop: 'Groundnuts', phRange: [5.9, 7.0], omMin: 1.5, water: 'low' as const, market: 'moderate' as const },
  ];

  return crops.map(c => {
    let score = 50;
    const reasons: string[] = [];
    const warnings: string[] = [];

    if (ph >= c.phRange[0] && ph <= c.phRange[1]) { score += 25; reasons.push('pH in optimal range'); }
    else { score -= 15; warnings.push(`pH ${ph} outside optimal range (${c.phRange[0]}-${c.phRange[1]})`); }

    if (organicMatter >= c.omMin) { score += 15; reasons.push('Adequate organic matter'); }
    else { score -= 10; warnings.push('Low organic matter — add compost before planting'); }

    return {
      crop: c.crop, suitabilityScore: Math.max(0, Math.min(100, score)),
      reasons, warnings, waterRequirement: c.water,
      growingSeason: 'Region-dependent', marketValue: c.market,
    };
  }).sort((a, b) => b.suitabilityScore - a.suitabilityScore);
}
