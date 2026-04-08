// Mock data for Earnings Intelligence Copilot

export interface QuarterData {
  quarter: string;
  fiscalYear: string;
  revenue: number;
  revenueGrowth: number;
  ebitda: number;
  ebitdaMargin: number;
  beatMeetMiss: 'beat' | 'meet' | 'miss';
  sentiment: 'positive' | 'neutral' | 'negative';
  callDifficulty: number; // 1-10
  topConcern: string;
  guidance: {
    revenue: string;
    ebitda: string;
  };
  highlights: string[];
  themes: string[];
  marketChatter: {
    positive: string[];
    negative: string[];
  };
}

export interface AnalystQuestion {
  id: string;
  question: string;
  category: string;
  quarter: string;
  analyst: string;
  frequency: number;
}

export interface PredictedQuestion {
  id: string;
  question: string;
  category: string;
  likelihood: number; // 0-100
  difficulty: number; // 1-10
  analystPersona: string;
  reasoning: string;
  recommendedAnswer: string;
  suggestedAnswer: string;
  talkingPoints: string[];
  confidence: number; // 0-100
  riskLevel: 'low' | 'medium' | 'high';
  evidencePoints: string[];
}

export interface AnalystPersona {
  name: string;
  firm: string;
  style: string;
  focusAreas: string[];
  aggressiveness: number; // 1-10
}

export const historicalQuarters: QuarterData[] = [
  {
    quarter: 'Q1',
    fiscalYear: 'FY26',
    revenue: 12500,
    revenueGrowth: 8.5,
    ebitda: 3200,
    ebitdaMargin: 25.6,
    beatMeetMiss: 'beat',
    sentiment: 'positive',
    callDifficulty: 4,
    topConcern: 'Margin sustainability',
    guidance: {
      revenue: '$13.0B - $13.5B',
      ebitda: '$3.3B - $3.5B'
    },
    highlights: [
      'Revenue exceeded guidance by 3%',
      'Operating margin expanded 120 bps YoY',
      'Strong performance in North America segment',
      'Customer acquisition up 15% QoQ'
    ],
    themes: ['Margin expansion', 'Volume growth', 'Market share gains', 'Pricing power'],
    marketChatter: {
      positive: [
        'Solid execution on margin targets',
        'Better than expected demand environment',
        'Strong cash generation'
      ],
      negative: [
        'Concerns about Q2 seasonality',
        'International segment weakness',
        'Rising input costs'
      ]
    }
  },
  {
    quarter: 'Q4',
    fiscalYear: 'FY25',
    revenue: 13200,
    revenueGrowth: 12.3,
    ebitda: 3450,
    ebitdaMargin: 26.1,
    beatMeetMiss: 'beat',
    sentiment: 'positive',
    callDifficulty: 3,
    topConcern: 'Guidance conservatism',
    guidance: {
      revenue: '$12.2B - $12.8B',
      ebitda: '$3.1B - $3.3B'
    },
    highlights: [
      'Record quarterly revenue',
      'Guidance raised for third consecutive quarter',
      'EBITDA margin reached all-time high',
      'Successfully integrated recent acquisition'
    ],
    themes: ['Record performance', 'Integration success', 'Operational excellence'],
    marketChatter: {
      positive: [
        'Exceptional quarter across the board',
        'Best-in-class margins',
        'Strong free cash flow'
      ],
      negative: [
        'High bar set for FY26',
        'Potential for guidance miss in downturn'
      ]
    }
  },
  {
    quarter: 'Q3',
    fiscalYear: 'FY25',
    revenue: 11800,
    revenueGrowth: 6.2,
    ebitda: 2950,
    ebitdaMargin: 25.0,
    beatMeetMiss: 'meet',
    sentiment: 'neutral',
    callDifficulty: 6,
    topConcern: 'Volume weakness',
    guidance: {
      revenue: '$12.8B - $13.2B',
      ebitda: '$3.3B - $3.5B'
    },
    highlights: [
      'Met revenue expectations',
      'Margin pressure from input costs',
      'Volume growth slowed to 3%',
      'Maintained market share'
    ],
    themes: ['Volume pressure', 'Cost inflation', 'Pricing actions', 'Market share defense'],
    marketChatter: {
      positive: [
        'Maintained guidance despite headwinds',
        'Effective cost management'
      ],
      negative: [
        'Weak volume trends',
        'Margin compression concerns',
        'Slower than peer growth'
      ]
    }
  },
  {
    quarter: 'Q2',
    fiscalYear: 'FY25',
    revenue: 11200,
    revenueGrowth: 9.8,
    ebitda: 2800,
    ebitdaMargin: 25.0,
    beatMeetMiss: 'beat',
    sentiment: 'positive',
    callDifficulty: 5,
    topConcern: 'Input cost inflation',
    guidance: {
      revenue: '$11.5B - $12.0B',
      ebitda: '$2.9B - $3.1B'
    },
    highlights: [
      'Strong revenue beat',
      'Successfully passed through pricing',
      'New product launches exceeded expectations',
      'E-commerce growth accelerated'
    ],
    themes: ['Pricing power', 'Innovation', 'Digital transformation'],
    marketChatter: {
      positive: [
        'Impressive pricing execution',
        'Strong demand signals',
        'Digital momentum'
      ],
      negative: [
        'Rising commodity costs',
        'Potential elasticity concerns'
      ]
    }
  },
  {
    quarter: 'Q1',
    fiscalYear: 'FY25',
    revenue: 10500,
    revenueGrowth: 11.5,
    ebitda: 2625,
    ebitdaMargin: 25.0,
    beatMeetMiss: 'beat',
    sentiment: 'positive',
    callDifficulty: 4,
    topConcern: 'Supply chain constraints',
    guidance: {
      revenue: '$11.0B - $11.5B',
      ebitda: '$2.7B - $2.9B'
    },
    highlights: [
      'Beat on both top and bottom line',
      'Supply chain improvements',
      'Market share gains in key segments',
      'Strong demand environment'
    ],
    themes: ['Supply chain recovery', 'Market share', 'Demand strength'],
    marketChatter: {
      positive: [
        'Better than expected supply chain',
        'Strong execution',
        'Positive demand trends'
      ],
      negative: [
        'Lingering supply constraints',
        'Transportation cost pressures'
      ]
    }
  },
  {
    quarter: 'Q4',
    fiscalYear: 'FY24',
    revenue: 10800,
    revenueGrowth: 8.0,
    ebitda: 2700,
    ebitdaMargin: 25.0,
    beatMeetMiss: 'meet',
    sentiment: 'neutral',
    callDifficulty: 7,
    topConcern: 'Margin guidance',
    guidance: {
      revenue: '$10.2B - $10.8B',
      ebitda: '$2.5B - $2.7B'
    },
    highlights: [
      'In-line with expectations',
      'Margin expansion initiatives launched',
      'Some market share loss to competitors',
      'Cautious outlook for FY25'
    ],
    themes: ['Margin focus', 'Competitive pressure', 'Restructuring'],
    marketChatter: {
      positive: [
        'Realistic guidance',
        'Cost reduction plan credible'
      ],
      negative: [
        'Market share concerns',
        'Conservative FY25 outlook',
        'Execution risks'
      ]
    }
  },
  {
    quarter: 'Q3',
    fiscalYear: 'FY24',
    revenue: 10200,
    revenueGrowth: 5.2,
    ebitda: 2550,
    ebitdaMargin: 25.0,
    beatMeetMiss: 'miss',
    sentiment: 'negative',
    callDifficulty: 9,
    topConcern: 'Revenue miss',
    guidance: {
      revenue: '$10.5B - $11.0B',
      ebitda: '$2.6B - $2.8B'
    },
    highlights: [
      'Missed revenue by 4%',
      'Demand softness in Europe',
      'Guidance reduced for Q4',
      'Announced restructuring plan'
    ],
    themes: ['Revenue shortfall', 'Geographic weakness', 'Restructuring'],
    marketChatter: {
      positive: [
        'Proactive restructuring actions'
      ],
      negative: [
        'Significant revenue miss',
        'Guidance cut',
        'Execution concerns',
        'Competitive losses'
      ]
    }
  },
  {
    quarter: 'Q2',
    fiscalYear: 'FY24',
    revenue: 9800,
    revenueGrowth: 7.5,
    ebitda: 2450,
    ebitdaMargin: 25.0,
    beatMeetMiss: 'meet',
    sentiment: 'neutral',
    callDifficulty: 6,
    topConcern: 'Slowing growth',
    guidance: {
      revenue: '$10.0B - $10.5B',
      ebitda: '$2.5B - $2.7B'
    },
    highlights: [
      'Met lowered expectations',
      'Growth deceleration continued',
      'Cost savings program on track',
      'Mixed segment performance'
    ],
    themes: ['Growth deceleration', 'Cost focus', 'Segment divergence'],
    marketChatter: {
      positive: [
        'Cost discipline improving',
        'Some stabilization signals'
      ],
      negative: [
        'Weak growth trajectory',
        'Unclear inflection point',
        'Peer comparisons unfavorable'
      ]
    }
  }
];

export const historicalQuestions: AnalystQuestion[] = [
  {
    id: 'q1',
    question: 'Can you walk us through the margin bridge from last quarter?',
    category: 'Margin / Profitability',
    quarter: 'Q1 FY26',
    analyst: 'Sarah Chen - Goldman Sachs',
    frequency: 8
  },
  {
    id: 'q2',
    question: 'What gives you confidence in the full-year revenue guidance?',
    category: 'Guidance',
    quarter: 'Q1 FY26',
    analyst: 'Michael Torres - JP Morgan',
    frequency: 12
  },
  {
    id: 'q3',
    question: 'How should we think about volume versus pricing contribution going forward?',
    category: 'Revenue / Growth',
    quarter: 'Q1 FY26',
    analyst: 'David Park - Morgan Stanley',
    frequency: 10
  },
  {
    id: 'q4',
    question: 'Can you provide more color on the weakness in the international segment?',
    category: 'Region / Segment Performance',
    quarter: 'Q4 FY25',
    analyst: 'Lisa Anderson - Bank of America',
    frequency: 6
  },
  {
    id: 'q5',
    question: 'What are you seeing in terms of competitive dynamics and market share trends?',
    category: 'Competition',
    quarter: 'Q4 FY25',
    analyst: 'Robert Kim - Barclays',
    frequency: 9
  },
  {
    id: 'q6',
    question: 'How are you managing input cost inflation and what pricing actions are planned?',
    category: 'Costs / Inflation',
    quarter: 'Q3 FY25',
    analyst: 'Jennifer Wu - Citi',
    frequency: 11
  },
  {
    id: 'q7',
    question: 'Can you discuss your capital allocation priorities for the next 12 months?',
    category: 'Capital Allocation',
    quarter: 'Q3 FY25',
    analyst: 'Thomas Brown - Wells Fargo',
    frequency: 7
  },
  {
    id: 'q8',
    question: 'What drove the working capital increase this quarter?',
    category: 'Margin / Profitability',
    quarter: 'Q2 FY25',
    analyst: 'Sarah Chen - Goldman Sachs',
    frequency: 5
  }
];

export const predictedQuestions: PredictedQuestion[] = [
  {
    id: 'pq1',
    question: 'Can you walk through the key drivers of the 120 bps margin expansion this quarter and how sustainable is this into Q2?',
    category: 'Margin / Profitability',
    likelihood: 95,
    difficulty: 7,
    analystPersona: 'Margin-Focused Analyst',
    reasoning: 'Strong margin performance (+120 bps) will draw questions on sustainability. Historical pattern shows margin questions after beats.',
    recommendedAnswer: 'Great question, Sarah. The 120 basis point expansion was driven by three primary factors. First, our operational efficiency initiatives delivered approximately 60 basis points through automation and process improvements in our manufacturing facilities. Second, we saw favorable product mix contributing 40 basis points as our premium product lines grew faster than the overall portfolio. Finally, pricing realization added 20 basis points. Looking ahead to Q2, we expect 75-80% of these gains to be sustainable. The operational efficiency improvements are structural and will continue, pricing is locked in, but we may see some normalization in product mix as seasonal patterns shift. Overall, we remain confident in sustaining strong margin performance.',
    suggestedAnswer: 'Great question, Sarah. The 120 basis point expansion was driven by three primary factors. First, our operational efficiency initiatives delivered approximately 60 basis points through automation and process improvements in our manufacturing facilities. Second, we saw favorable product mix contributing 40 basis points as our premium product lines grew faster than the overall portfolio. Finally, pricing realization added 20 basis points. Looking ahead to Q2, we expect 75-80% of these gains to be sustainable. The operational efficiency improvements are structural and will continue, pricing is locked in, but we may see some normalization in product mix as seasonal patterns shift. Overall, we remain confident in sustaining strong margin performance.',
    talkingPoints: [
      'Operational efficiency from automation investments',
      'Premium product mix shift continues',
      'Pricing actions fully realized',
      'Some mix normalization expected but maintains most gains'
    ],
    confidence: 85,
    riskLevel: 'medium',
    evidencePoints: [
      'Cost savings program delivered $45M in Q1',
      'Premium SKUs grew 22% vs total growth of 8.5%',
      'Price increases averaged 3.5% with <1% volume elasticity'
    ]
  },
  {
    id: 'pq2',
    question: 'Your guidance implies a deceleration in Q2. What are the specific headwinds you are anticipating?',
    category: 'Guidance',
    likelihood: 92,
    difficulty: 8,
    analystPersona: 'Conservative Analyst',
    reasoning: 'Q2 guidance midpoint suggests slower growth vs Q1. Analysts will probe for reasons and downside risks.',
    recommendedAnswer: 'Thanks, Michael. I appreciate the opportunity to provide context. Our Q2 guidance reflects three factors. First, we face normal seasonal patterns—historically Q2 is softer sequentially. Second, we\'re lapping a very strong Q2 last year that grew 15%, creating a tougher comparison. Third, given the current macro uncertainty, we\'re taking a prudent approach. I want to be clear: we are not seeing deterioration in underlying business fundamentals. Demand trends remain solid, our pipeline is healthy, and customer engagement is strong. We prefer to set realistic expectations and have the opportunity to exceed them, rather than overpromise. The guidance reflects conservative planning, not concern about business trends.',
    suggestedAnswer: 'Thanks, Michael. I appreciate the opportunity to provide context. Our Q2 guidance reflects three factors. First, we face normal seasonal patterns—historically Q2 is softer sequentially. Second, we\'re lapping a very strong Q2 last year that grew 15%, creating a tougher comparison. Third, given the current macro uncertainty, we\'re taking a prudent approach. I want to be clear: we are not seeing deterioration in underlying business fundamentals. Demand trends remain solid, our pipeline is healthy, and customer engagement is strong. We prefer to set realistic expectations and have the opportunity to exceed them, rather than overpromise. The guidance reflects conservative planning, not concern about business trends.',
    talkingPoints: [
      'Q2 has historical seasonal patterns',
      'Lapping strong Q2 FY25 (+15% growth)',
      'Macro uncertainty warrants prudent guidance',
      'Underlying business trends remain strong',
      'Prefer to under-promise and over-deliver'
    ],
    confidence: 90,
    riskLevel: 'low',
    evidencePoints: [
      'Q2 FY25 grew 15% - difficult comparison',
      'Historical Q2 seasonal dip of 5-7%',
      'Current order book tracking in line with guidance'
    ]
  },
  {
    id: 'pq3',
    question: 'How much of your revenue growth is coming from volume versus price, and what is your pricing strategy for the rest of the year?',
    category: 'Revenue / Growth',
    likelihood: 88,
    difficulty: 6,
    analystPersona: 'Growth-Focused Analyst',
    reasoning: 'Volume/price mix is a recurring analyst focus. With inflation moderating, analysts will probe pricing sustainability.',
    recommendedAnswer: 'David, this is a really important topic. In Q1, we achieved balanced growth with volume contributing 5.5 percentage points and pricing adding 3.0 points. This is exactly the mix we want to see—healthy unit volume growth combined with value-based pricing. On pricing strategy, let me be clear about our approach. We don\'t do cost-plus pricing; we price based on the value we deliver to customers. This means our pricing is sustainable regardless of what happens with input costs. We\'ve seen minimal elasticity impact from our pricing actions, with customer retention remaining above 95%. For the full year, we expect this balanced mix to continue. We\'re not planning additional large pricing actions beyond what\'s already been implemented, and we\'re focused on driving volume through innovation and customer acquisition.',
    suggestedAnswer: 'David, this is a really important topic. In Q1, we achieved balanced growth with volume contributing 5.5 percentage points and pricing adding 3.0 points. This is exactly the mix we want to see—healthy unit volume growth combined with value-based pricing. On pricing strategy, let me be clear about our approach. We don\'t do cost-plus pricing; we price based on the value we deliver to customers. This means our pricing is sustainable regardless of what happens with input costs. We\'ve seen minimal elasticity impact from our pricing actions, with customer retention remaining above 95%. For the full year, we expect this balanced mix to continue. We\'re not planning additional large pricing actions beyond what\'s already been implemented, and we\'re focused on driving volume through innovation and customer acquisition.',
    talkingPoints: [
      'Volume: +5.5%, Price: +3.0%',
      'Balanced growth across both levers',
      'Value-based pricing strategy',
      'No significant elasticity observed',
      'Pricing to sustain through FY26'
    ],
    confidence: 88,
    riskLevel: 'low',
    evidencePoints: [
      'Volume growth of 5.5% driven by new customer wins',
      'Pricing actions taken in Q4 FY25 fully realized',
      'Customer retention rate >95%'
    ]
  },
  {
    id: 'pq4',
    question: 'The international segment remains weak. What specific actions are you taking to turn this around?',
    category: 'Region / Segment Performance',
    likelihood: 85,
    difficulty: 8,
    analystPersona: 'Detail-Oriented Analyst',
    reasoning: 'International weakness mentioned in market chatter. Analysts will want concrete turnaround plan.',
    recommendedAnswer: 'Lisa, thanks for raising this. We\'re not satisfied with our international performance, and we have a very specific action plan in place. First, we\'ve brought in new leadership for our Europe region—our new GM started February 1st and brings a proven track record of turnarounds. Second, we\'re launching a localized product portfolio in Q3 specifically designed for European preferences. Our testing shows a 25% improvement in customer preference scores for these products. Third, we\'ve streamlined our go-to-market model, reducing distribution costs by 15% while improving customer reach. The timeline is: stabilization by Q2, meaning we stop losing share, and a return to growth by Q4. I want to be transparent—this is a multi-quarter effort, but we have high confidence in the plan and the team executing it.',
    suggestedAnswer: 'Lisa, thanks for raising this. We\'re not satisfied with our international performance, and we have a very specific action plan in place. First, we\'ve brought in new leadership for our Europe region—our new GM started February 1st and brings a proven track record of turnarounds. Second, we\'re launching a localized product portfolio in Q3 specifically designed for European preferences. Our testing shows a 25% improvement in customer preference scores for these products. Third, we\'ve streamlined our go-to-market model, reducing distribution costs by 15% while improving customer reach. The timeline is: stabilization by Q2, meaning we stop losing share, and a return to growth by Q4. I want to be transparent—this is a multi-quarter effort, but we have high confidence in the plan and the team executing it.',
    talkingPoints: [
      'New regional leadership with strong track record',
      'Localized products launching Q3',
      'Simplified distribution model',
      'Expect stabilization Q2, growth by Q4',
      'Market share defense is priority'
    ],
    confidence: 72,
    riskLevel: 'high',
    evidencePoints: [
      'New Europe GM started February 1',
      'Localized product testing shows 25% preference improvement',
      'Distribution costs reduced 15% with new model'
    ]
  },
  {
    id: 'pq5',
    question: 'Can you provide more granularity on your cash conversion and working capital trends?',
    category: 'Capital Allocation',
    likelihood: 78,
    difficulty: 5,
    analystPersona: 'Cash Flow Analyst',
    reasoning: 'Working capital historically a topic. Strong EBITDA should drive questions on cash conversion.',
    recommendedAnswer: 'Absolutely, Thomas. Cash conversion was 92% in Q1, which is slightly below our 95% target, but this is entirely planned and temporary. We deliberately built inventory in Q1 to support major product launches scheduled for Q2 and Q3—we added about $150 million in inventory specifically for this purpose. This is a strategic investment in growth. Looking forward, we expect to return to our normal 95%+ cash conversion rate in Q2 as the inventory investment moderates. On working capital efficiency, we actually improved working capital as a percentage of sales by 50 basis points year-over-year. Our days sales outstanding improved by 2 days, reflecting strong collections. The bottom line: cash generation remains very strong at $2.1 billion in Q1, and we\'re extremely confident in our ability to convert earnings to cash consistently.',
    suggestedAnswer: 'Absolutely, Thomas. Cash conversion was 92% in Q1, which is slightly below our 95% target, but this is entirely planned and temporary. We deliberately built inventory in Q1 to support major product launches scheduled for Q2 and Q3—we added about $150 million in inventory specifically for this purpose. This is a strategic investment in growth. Looking forward, we expect to return to our normal 95%+ cash conversion rate in Q2 as the inventory investment moderates. On working capital efficiency, we actually improved working capital as a percentage of sales by 50 basis points year-over-year. Our days sales outstanding improved by 2 days, reflecting strong collections. The bottom line: cash generation remains very strong at $2.1 billion in Q1, and we\'re extremely confident in our ability to convert earnings to cash consistently.',
    talkingPoints: [
      'Q1 cash conversion: 92%',
      'Planned inventory build for launches',
      'Q2 expect return to 95%+ conversion',
      'Working capital efficiency improving',
      'Strong cash generation continues'
    ],
    confidence: 90,
    riskLevel: 'low',
    evidencePoints: [
      'Cash from operations: $2.1B in Q1',
      'Inventory up $150M for Q2 launches (planned)',
      'DSO improved 2 days YoY'
    ]
  },
  {
    id: 'pq6',
    question: 'What are you seeing from competitors, particularly on pricing and promotional activity?',
    category: 'Competition',
    likelihood: 82,
    difficulty: 7,
    analystPersona: 'Industry Specialist',
    reasoning: 'Competitive dynamics always a focus. Strong results may prompt questions about sustainability vs competition.',
    recommendedAnswer: 'Robert, great question. The competitive environment remains rational and disciplined. We\'re not seeing irrational pricing behavior or elevated promotional activity from major competitors. Everyone in the industry understands the need to preserve value. From a market share perspective, we\'re actually stable to slightly up across our key categories—we gained about 20 basis points in Q1. This tells me our value proposition remains differentiated and compelling to customers. We\'re winning through innovation and customer experience, not through price competition. Our recent product launches have been very well received, creating competitive moats that protect our position. As long as we continue to innovate and deliver superior value, we feel very good about maintaining and growing our market position.',
    suggestedAnswer: 'Robert, great question. The competitive environment remains rational and disciplined. We\'re not seeing irrational pricing behavior or elevated promotional activity from major competitors. Everyone in the industry understands the need to preserve value. From a market share perspective, we\'re actually stable to slightly up across our key categories—we gained about 20 basis points in Q1. This tells me our value proposition remains differentiated and compelling to customers. We\'re winning through innovation and customer experience, not through price competition. Our recent product launches have been very well received, creating competitive moats that protect our position. As long as we continue to innovate and deliver superior value, we feel very good about maintaining and growing our market position.',
    talkingPoints: [
      'Rational competitive environment',
      'No irrational pricing observed',
      'Market share stable to up',
      'Differentiated value proposition',
      'Innovation creating competitive moats'
    ],
    confidence: 80,
    riskLevel: 'medium',
    evidencePoints: [
      'Market share +20 bps in core categories',
      'Competitor pricing tracking industry benchmarks',
      'Promotional spending flat YoY'
    ]
  },
  {
    id: 'pq7',
    question: 'How should we think about capital deployment priorities—buyback vs M&A vs debt paydown?',
    category: 'Capital Allocation',
    likelihood: 75,
    difficulty: 6,
    analystPersona: 'Shareholder-Focused Analyst',
    reasoning: 'Strong cash generation will drive capital allocation questions. Investors want clarity on priorities.',
    recommendedAnswer: 'Thanks for the question. Our capital allocation framework is very consistent and disciplined. Priority number one is always investing in organic growth—R&D, capacity, technology, people. That\'s how we create long-term value. Priority two is our dividend. We have a 10-year track record of growing the dividend, and we intend to maintain that. Priority three is opportunistic share buybacks. We have a $2 billion authorization over 12 months, and we\'ll be active when we see value. On M&A, we remain open to bolt-on acquisitions that are strategically additive, but it\'s not a priority in the near term. The beauty of our balance sheet is that we have flexibility to do all of these things. At 1.8 times net debt to EBITDA, well below our 2.5x target, we have ample capacity for growth investments, shareholder returns, and opportunistic M&A if the right opportunity emerges.',
    suggestedAnswer: 'Thanks for the question. Our capital allocation framework is very consistent and disciplined. Priority number one is always investing in organic growth—R&D, capacity, technology, people. That\'s how we create long-term value. Priority two is our dividend. We have a 10-year track record of growing the dividend, and we intend to maintain that. Priority three is opportunistic share buybacks. We have a $2 billion authorization over 12 months, and we\'ll be active when we see value. On M&A, we remain open to bolt-on acquisitions that are strategically additive, but it\'s not a priority in the near term. The beauty of our balance sheet is that we have flexibility to do all of these things. At 1.8 times net debt to EBITDA, well below our 2.5x target, we have ample capacity for growth investments, shareholder returns, and opportunistic M&A if the right opportunity emerges.',
    talkingPoints: [
      'Priority 1: Organic growth investment',
      'Priority 2: Maintain and grow dividend',
      'Priority 3: Opportunistic buybacks',
      'M&A: Selective bolt-ons only',
      'Strong balance sheet provides flexibility'
    ],
    confidence: 88,
    riskLevel: 'low',
    evidencePoints: [
      'Net debt/EBITDA: 1.8x (target <2.5x)',
      'Authorized $2B buyback program (12 months)',
      'Dividend yield: 2.1% with 10-year growth history'
    ]
  },
  {
    id: 'pq8',
    question: 'Any update on the regulatory environment and potential impacts to your business?',
    category: 'Regulation / Risk',
    likelihood: 65,
    difficulty: 7,
    analystPersona: 'Risk-Focused Analyst',
    reasoning: 'Regulatory topics are sector-specific. May come up if recent news or peer mentions.',
    recommendedAnswer: 'Jennifer, we monitor the regulatory landscape very closely and maintain proactive engagement with policymakers. On the specific proposals currently being discussed, our assessment is that they would have minimal impact on our business model if enacted. We\'ve stress-tested various scenarios, and none create material risk to our FY26 outlook or long-term strategy. From a compliance standpoint, we\'re in excellent shape—our most recent audit scores were above 95%, and we\'ve actually expanded our regulatory affairs team this year to stay ahead of any changes. We participate actively in industry trade associations to ensure our voice is heard in policy discussions. Bottom line: regulation is something we take seriously and manage proactively, but we don\'t see it as a headwind to our business.',
    suggestedAnswer: 'Jennifer, we monitor the regulatory landscape very closely and maintain proactive engagement with policymakers. On the specific proposals currently being discussed, our assessment is that they would have minimal impact on our business model if enacted. We\'ve stress-tested various scenarios, and none create material risk to our FY26 outlook or long-term strategy. From a compliance standpoint, we\'re in excellent shape—our most recent audit scores were above 95%, and we\'ve actually expanded our regulatory affairs team this year to stay ahead of any changes. We participate actively in industry trade associations to ensure our voice is heard in policy discussions. Bottom line: regulation is something we take seriously and manage proactively, but we don\'t see it as a headwind to our business.',
    talkingPoints: [
      'Monitoring regulatory landscape closely',
      'Minimal expected impact from current proposals',
      'Strong compliance infrastructure',
      'Proactive regulator engagement',
      'No material FY26 impact anticipated'
    ],
    confidence: 75,
    riskLevel: 'low',
    evidencePoints: [
      'Regulatory affairs team expanded in 2025',
      'Compliance audit scores >95%',
      'Active trade association participation'
    ]
  }
];

export const analystPersonas: AnalystPersona[] = [
  {
    name: 'Sarah Chen',
    firm: 'Goldman Sachs',
    style: 'Detail-oriented, margin-focused',
    focusAreas: ['Margin drivers', 'Working capital', 'Cost structure', 'Efficiency'],
    aggressiveness: 7
  },
  {
    name: 'Michael Torres',
    firm: 'JP Morgan',
    style: 'Big picture, guidance-focused',
    focusAreas: ['Guidance credibility', 'Long-term outlook', 'Strategic direction'],
    aggressiveness: 6
  },
  {
    name: 'David Park',
    firm: 'Morgan Stanley',
    style: 'Growth and revenue focused',
    focusAreas: ['Volume trends', 'Pricing power', 'Market share', 'Customer growth'],
    aggressiveness: 5
  },
  {
    name: 'Lisa Anderson',
    firm: 'Bank of America',
    style: 'Segment and geographic analyst',
    focusAreas: ['Regional performance', 'Segment trends', 'Portfolio mix'],
    aggressiveness: 6
  },
  {
    name: 'Robert Kim',
    firm: 'Barclays',
    style: 'Competitive dynamics expert',
    focusAreas: ['Competition', 'Market share', 'Peer comparison', 'Industry trends'],
    aggressiveness: 8
  },
  {
    name: 'Jennifer Wu',
    firm: 'Citi',
    style: 'Cost and inflation focused',
    focusAreas: ['Input costs', 'Inflation management', 'Pricing strategy', 'Margin defense'],
    aggressiveness: 7
  },
  {
    name: 'Thomas Brown',
    firm: 'Wells Fargo',
    style: 'Cash flow and capital allocation',
    focusAreas: ['Free cash flow', 'Capital deployment', 'Dividend', 'Buybacks', 'M&A'],
    aggressiveness: 5
  }
];

export const companyInfo = {
  name: 'Enterprise Corporation',
  ticker: 'TNVA',
  sector: 'Technology'
};

export const earningsReadinessMetrics = {
  questionCoverage: 87,
  answerConfidence: 82,
  riskExposure: 28,
  historicalAlignment: 91,
  narrativeConsistency: 88,
  overallScore: 84
};

export const peerBenchmarks = [
  {
    company: 'Competitor A',
    recentQuarter: 'Q1 FY26',
    topicsAsked: ['Cloud growth', 'AI investments', 'Margin trajectory', 'Customer retention'],
    sentiment: 'positive'
  },
  {
    company: 'Competitor B',
    recentQuarter: 'Q1 FY26',
    topicsAsked: ['Revenue guidance', 'International weakness', 'Competition', 'Pricing pressure'],
    sentiment: 'negative'
  },
  {
    company: 'Competitor C',
    recentQuarter: 'Q4 FY25',
    topicsAsked: ['M&A strategy', 'Integration progress', 'Synergies', 'Debt levels'],
    sentiment: 'neutral'
  }
];