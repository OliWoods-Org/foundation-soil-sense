/**
 * PestWarning — Early pest and disease detection using weather patterns,
 * satellite imagery indicators, and regional outbreak reports.
 */

import { z } from 'zod';

export const PestAlertSchema = z.object({
  id: z.string().uuid(), issuedAt: z.string().datetime(),
  region: z.object({ latitude: z.number(), longitude: z.number(), radiusKm: z.number() }),
  pest: z.string(), pestType: z.enum(['insect', 'fungal', 'bacterial', 'viral', 'nematode', 'weed']),
  affectedCrops: z.array(z.string()),
  riskLevel: z.enum(['watch', 'warning', 'alert', 'outbreak']),
  triggers: z.array(z.object({ factor: z.string(), value: z.string(), threshold: z.string() })),
  recommendations: z.array(z.object({ action: z.string(), timing: z.string(), isOrganic: z.boolean(), estimatedCost: z.string() })),
  expectedDuration: z.string(),
  source: z.enum(['weather_model', 'satellite', 'field_report', 'regional_extension']),
});

export const WeatherRiskSchema = z.object({
  location: z.object({ latitude: z.number(), longitude: z.number() }),
  assessedAt: z.string().datetime(),
  conditions: z.object({
    temperatureC: z.number(), humidityPercent: z.number(),
    rainfallMm24h: z.number(), windSpeedKmh: z.number(),
    consecutiveWetDays: z.number(), consecutiveDryDays: z.number(),
  }),
  risks: z.array(z.object({
    pest: z.string(), riskScore: z.number().min(0).max(100),
    reason: z.string(), prevention: z.string(),
  })),
});

export type PestAlert = z.infer<typeof PestAlertSchema>;
export type WeatherRisk = z.infer<typeof WeatherRiskSchema>;

interface PestCondition {
  pest: string; type: PestAlert['pestType']; crops: string[];
  tempRange: [number, number]; humidityMin: number; wetDaysMin: number;
  prevention: string;
}

const PEST_CONDITIONS: PestCondition[] = [
  { pest: 'Fall Armyworm', type: 'insect', crops: ['maize', 'rice', 'sorghum'], tempRange: [25, 35], humidityMin: 60, wetDaysMin: 0, prevention: 'Scout fields weekly, apply neem oil at first sign, consider Bt-based biopesticide' },
  { pest: 'Late Blight', type: 'fungal', crops: ['potato', 'tomato'], tempRange: [10, 25], humidityMin: 80, wetDaysMin: 3, prevention: 'Preventive copper spray, improve air circulation, avoid overhead irrigation' },
  { pest: 'Rust', type: 'fungal', crops: ['wheat', 'coffee', 'beans'], tempRange: [15, 25], humidityMin: 70, wetDaysMin: 2, prevention: 'Plant resistant varieties, fungicide at first sign, remove volunteer plants' },
  { pest: 'Stem Borer', type: 'insect', crops: ['maize', 'rice', 'sugarcane'], tempRange: [20, 35], humidityMin: 50, wetDaysMin: 0, prevention: 'Push-pull technology, destroy crop residues, early planting' },
  { pest: 'Root Rot', type: 'fungal', crops: ['cassava', 'beans', 'groundnuts'], tempRange: [20, 30], humidityMin: 85, wetDaysMin: 5, prevention: 'Improve drainage, crop rotation, avoid waterlogged conditions' },
  { pest: 'Aphids', type: 'insect', crops: ['beans', 'wheat', 'tomatoes', 'potato'], tempRange: [15, 30], humidityMin: 40, wetDaysMin: 0, prevention: 'Spray soapy water, introduce ladybugs, neem oil application' },
];

export function assessWeatherRisk(
  temp: number, humidity: number, rainfall24h: number,
  wetDays: number, dryDays: number,
  location: { latitude: number; longitude: number }
): WeatherRisk {
  const risks = PEST_CONDITIONS
    .filter(pc => temp >= pc.tempRange[0] && temp <= pc.tempRange[1] && humidity >= pc.humidityMin && wetDays >= pc.wetDaysMin)
    .map(pc => {
      let score = 30;
      score += Math.min(30, (humidity - pc.humidityMin) * 0.5);
      score += Math.min(20, wetDays * 5);
      if (rainfall24h > 20) score += 10;
      return { pest: pc.pest, riskScore: Math.min(100, Math.round(score)), reason: `Temp ${temp}C, humidity ${humidity}%, ${wetDays} wet days favor ${pc.pest}`, prevention: pc.prevention };
    })
    .sort((a, b) => b.riskScore - a.riskScore);

  return {
    location, assessedAt: new Date().toISOString(),
    conditions: { temperatureC: temp, humidityPercent: humidity, rainfallMm24h: rainfall24h, windSpeedKmh: 0, consecutiveWetDays: wetDays, consecutiveDryDays: dryDays },
    risks,
  };
}

export function generatePestAlert(risk: WeatherRisk['risks'][0], crops: string[], location: { latitude: number; longitude: number }): PestAlert {
  const condition = PEST_CONDITIONS.find(pc => pc.pest === risk.pest);
  const riskLevel = risk.riskScore >= 80 ? 'outbreak' as const : risk.riskScore >= 60 ? 'alert' as const : risk.riskScore >= 40 ? 'warning' as const : 'watch' as const;

  return {
    id: crypto.randomUUID(), issuedAt: new Date().toISOString(),
    region: { ...location, radiusKm: 25 },
    pest: risk.pest, pestType: condition?.type ?? 'insect',
    affectedCrops: condition?.crops.filter(c => crops.includes(c)) ?? crops,
    riskLevel,
    triggers: [{ factor: 'Weather conditions', value: risk.reason, threshold: `Risk score ${risk.riskScore}/100` }],
    recommendations: [{ action: risk.prevention, timing: 'Immediately', isOrganic: risk.prevention.includes('neem') || risk.prevention.includes('copper'), estimatedCost: 'low' }],
    expectedDuration: '7-14 days', source: 'weather_model',
  };
}
