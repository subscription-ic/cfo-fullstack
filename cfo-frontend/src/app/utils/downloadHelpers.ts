/**
 * Utility functions for generating and downloading files
 */

export const downloadTextFile = (content: string, filename: string) => {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const downloadHTMLFile = (content: string, filename: string) => {
  const blob = new Blob([content], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const downloadCSVFile = (content: string, filename: string) => {
  const blob = new Blob([content], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const generatePrepPackDocument = (quarter: string, data: any) => {
  const content = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Earnings Preparation Package - ${quarter}</title>
  <style>
    * { font-family: 'Montserrat', Arial, sans-serif; }
    body { max-width: 800px; margin: 40px auto; padding: 20px; line-height: 1.6; color: #1a1a1a; }
    h1 { color: #004C8F; border-bottom: 3px solid #004C8F; padding-bottom: 10px; font-size: 28px; }
    h2 { color: #004C8F; margin-top: 30px; font-size: 20px; }
    h3 { color: #002850; font-size: 16px; margin-top: 20px; }
    .header { background: #E8F2F9; padding: 20px; border-left: 4px solid #004C8F; margin-bottom: 30px; }
    .metric { background: #f5f7fa; padding: 15px; margin: 10px 0; border-radius: 4px; }
    .metric-label { color: #4a5568; font-size: 14px; margin-bottom: 5px; }
    .metric-value { color: #004C8F; font-size: 24px; font-weight: 600; }
    .highlight { background: #fff3cd; padding: 15px; border-left: 4px solid #E31837; margin: 20px 0; }
    .question { background: white; padding: 15px; border: 1px solid #d4dce6; margin: 10px 0; border-radius: 4px; }
    .answer { background: #E8F2F9; padding: 15px; margin-top: 10px; border-radius: 4px; }
    .footer { margin-top: 50px; padding-top: 20px; border-top: 2px solid #d4dce6; color: #4a5568; font-size: 12px; text-align: center; }
    ul { padding-left: 20px; }
    li { margin: 8px 0; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Earnings Call Preparation Package</h1>
    <p><strong>Quarter:</strong> ${quarter}</p>
    <p><strong>Generated:</strong> ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
  </div>

  <h2>Executive Summary</h2>
  <p>This comprehensive preparation package includes predicted questions, recommended answers, key metrics, and strategic talking points for the upcoming earnings call.</p>

  <div class="metric">
    <div class="metric-label">Revenue</div>
    <div class="metric-value">$8.5B</div>
    <div style="color: #10b981; margin-top: 5px;">+8.5% YoY</div>
  </div>

  <div class="metric">
    <div class="metric-label">EBITDA Margin</div>
    <div class="metric-value">26.8%</div>
    <div style="color: #10b981; margin-top: 5px;">+120 bps YoY</div>
  </div>

  <h2>Top 10 Predicted Questions</h2>
  
  <div class="question">
    <h3>1. Can you walk through the key drivers of the 120 bps margin expansion this quarter?</h3>
    <div class="answer">
      <strong>Recommended Answer:</strong><br>
      The 120 basis point expansion was driven by three factors: operational efficiency gains (60 bps), favorable product mix (40 bps), and pricing realization (20 bps). Our automation investments are delivering meaningful productivity improvements, particularly in our core operations. The mix shift toward higher-margin products is sustainable given our product roadmap. We've maintained pricing discipline despite competitive pressures.
    </div>
    <p><strong>Confidence Score:</strong> 94% | <strong>Risk Level:</strong> Medium</p>
  </div>

  <div class="question">
    <h3>2. What gives you confidence in the full-year revenue guidance?</h3>
    <div class="answer">
      <strong>Recommended Answer:</strong><br>
      Our full-year guidance is supported by several factors: strong demand visibility in our enterprise segment, a healthy pipeline that's up 15% year-over-year, and continued market share gains. We have $2.1B in backlog providing revenue visibility. While we're monitoring macro conditions, our diversified business model and recurring revenue base provide resilience.
    </div>
    <p><strong>Confidence Score:</strong> 91% | <strong>Risk Level:</strong> Low</p>
  </div>

  <div class="highlight">
    <h3>⚠ Key Risk Topics to Prepare For:</h3>
    <ul>
      <li><strong>International weakness:</strong> Prepare detailed turnaround narrative with timeline</li>
      <li><strong>Guidance conservatism:</strong> Q2 guidance implies deceleration - explain seasonal factors</li>
      <li><strong>Competitive dynamics:</strong> Be ready to address market share questions</li>
    </ul>
  </div>

  <h2>Key Numbers to Memorize</h2>
  <ul>
    <li>Revenue: $8.5B (+8.5% YoY)</li>
    <li>EBITDA Margin: 26.8% (+120 bps)</li>
    <li>Volume contribution: 5.5 points</li>
    <li>Price contribution: 3.0 points</li>
    <li>Backlog: $2.1B (+15% YoY)</li>
    <li>Cash conversion: 92%</li>
  </ul>

  <h2>One-Line Narrative Anchors</h2>
  <ul>
    <li>"We're delivering strong execution while maintaining our focus on long-term value creation"</li>
    <li>"Our margin expansion reflects sustainable operational improvements"</li>
    <li>"We're seeing healthy demand across all major customer segments"</li>
    <li>"International turnaround is on track with new leadership in place"</li>
  </ul>

  <h2>Do Say / Don't Say</h2>
  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 15px;">
    <div style="background: #d1fae5; padding: 15px; border-radius: 4px;">
      <h3 style="color: #065f46;">✓ Do Say:</h3>
      <ul style="margin-top: 10px;">
        <li>"Sustainable margin improvements"</li>
        <li>"Disciplined pricing approach"</li>
        <li>"Strong execution across the business"</li>
        <li>"Confident in our full-year outlook"</li>
      </ul>
    </div>
    <div style="background: #fee2e2; padding: 15px; border-radius: 4px;">
      <h3 style="color: #991b1b;">✗ Don't Say:</h3>
      <ul style="margin-top: 10px;">
        <li>"One-time benefits"</li>
        <li>"Uncertain macroeconomic environment"</li>
        <li>"Challenging competitive dynamics"</li>
        <li>"Cautious outlook"</li>
      </ul>
    </div>
  </div>

  <div class="footer">
    <p><strong>CONFIDENTIAL</strong> - For Internal Use Only</p>
    <p>Earnings Intelligence Copilot | Generated on ${new Date().toLocaleString()}</p>
  </div>
</body>
</html>
  `;
  
  return content;
};

export const generateCheatSheet = (questions: any[]) => {
  const content = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Earnings Call Cheat Sheet</title>
  <style>
    * { font-family: 'Montserrat', Arial, sans-serif; }
    body { max-width: 1000px; margin: 20px auto; padding: 20px; line-height: 1.5; color: #1a1a1a; }
    h1 { color: #004C8F; font-size: 24px; margin-bottom: 20px; border-bottom: 2px solid #004C8F; padding-bottom: 10px; }
    h2 { color: #004C8F; font-size: 18px; margin-top: 25px; }
    .header { background: #E8F2F9; padding: 15px; border-left: 4px solid #004C8F; margin-bottom: 20px; }
    .qa-pair { background: white; border: 1px solid #d4dce6; padding: 15px; margin: 12px 0; border-radius: 4px; page-break-inside: avoid; }
    .question { font-weight: 600; color: #002850; margin-bottom: 8px; }
    .answer { color: #1a1a1a; background: #f5f7fa; padding: 10px; border-radius: 4px; margin-top: 8px; }
    .talking-points { margin-top: 8px; }
    .talking-points li { margin: 5px 0; font-size: 14px; }
    .risk-high { color: #E31837; font-weight: 600; }
    .risk-medium { color: #f59e0b; font-weight: 600; }
    .risk-low { color: #10b981; font-weight: 600; }
    .key-numbers { background: #E8F2F9; padding: 15px; border-radius: 4px; margin: 15px 0; }
    .key-numbers ul { columns: 2; }
    @media print { body { margin: 0; padding: 15px; } .qa-pair { page-break-inside: avoid; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>Earnings Call Cheat Sheet</h1>
    <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
  </div>

  <div class="key-numbers">
    <h2>Quick Reference Numbers</h2>
    <ul>
      <li>Revenue: $8.5B (+8.5%)</li>
      <li>EBITDA Margin: 26.8%</li>
      <li>Volume: +5.5 points</li>
      <li>Price: +3.0 points</li>
      <li>Backlog: $2.1B</li>
      <li>Cash conversion: 92%</li>
    </ul>
  </div>

  <h2>Top Questions & Answers</h2>
  
  ${questions.slice(0, 10).map((q, idx) => `
    <div class="qa-pair">
      <div class="question">${idx + 1}. ${q.question}</div>
      <div style="font-size: 12px; color: #4a5568; margin: 5px 0;">
        Likelihood: ${q.likelihood}% | Risk: <span class="risk-${q.riskLevel}">${q.riskLevel.toUpperCase()}</span>
      </div>
      <div class="answer">
        <strong>Answer:</strong> ${q.recommendedAnswer}
      </div>
      <div class="talking-points">
        <strong>Key Points:</strong>
        <ul>
          ${q.talkingPoints.map((point: string) => `<li>${point}</li>`).join('')}
        </ul>
      </div>
    </div>
  `).join('')}

  <div style="margin-top: 30px; padding-top: 20px; border-top: 2px solid #d4dce6; color: #4a5568; font-size: 11px; text-align: center;">
    <p><strong>CONFIDENTIAL</strong> - For Internal Use Only</p>
  </div>
</body>
</html>
  `;
  
  return content;
};

export const generateLearningReport = (quarter: string, data: any) => {
  const content = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Model Learning Report - ${quarter}</title>
  <style>
    * { font-family: 'Montserrat', Arial, sans-serif; }
    body { max-width: 900px; margin: 40px auto; padding: 20px; line-height: 1.6; color: #1a1a1a; }
    h1 { color: #004C8F; border-bottom: 3px solid #004C8F; padding-bottom: 10px; font-size: 28px; }
    h2 { color: #004C8F; margin-top: 30px; font-size: 20px; }
    .header { background: #E8F2F9; padding: 20px; border-left: 4px solid #004C8F; margin-bottom: 30px; }
    .metrics-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin: 20px 0; }
    .metric-card { background: #f5f7fa; padding: 15px; border-radius: 4px; text-align: center; border: 1px solid #d4dce6; }
    .metric-label { color: #4a5568; font-size: 14px; margin-bottom: 8px; }
    .metric-value { color: #004C8F; font-size: 32px; font-weight: 600; }
    .insight { background: white; padding: 15px; border-left: 4px solid #10b981; margin: 15px 0; border: 1px solid #d4dce6; border-radius: 4px; }
    .insight.warning { border-left-color: #E31837; }
    .insight.info { border-left-color: #f59e0b; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #d4dce6; }
    th { background: #E8F2F9; color: #004C8F; font-weight: 600; }
    .footer { margin-top: 50px; padding-top: 20px; border-top: 2px solid #d4dce6; color: #4a5568; font-size: 12px; text-align: center; }
  </style>
</head>
<body>
  <div class="header">
    <h1>AI Model Learning Report</h1>
    <p><strong>Quarter:</strong> ${quarter}</p>
    <p><strong>Report Date:</strong> ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
  </div>

  <h2>Performance Metrics</h2>
  <div class="metrics-grid">
    <div class="metric-card">
      <div class="metric-label">Prediction Accuracy</div>
      <div class="metric-value">75%</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Top Concern Recall</div>
      <div class="metric-value">88%</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Answer Usefulness</div>
      <div class="metric-value">82%</div>
    </div>
  </div>

  <h2>Key Learnings</h2>
  
  <div class="insight">
    <h3 style="margin-top: 0; color: #10b981;">✓ Strong Performance</h3>
    <p><strong>Margin question prediction:</strong> Correctly predicted all margin-related questions with 92%+ similarity scores. The model successfully identified this as a key focus area based on prior quarter trends.</p>
  </div>

  <div class="insight warning">
    <h3 style="margin-top: 0; color: #E31837;">✗ Missed Questions</h3>
    <p><strong>Cloud migration focus:</strong> Analysts unexpectedly focused on technology transformation initiatives. The model did not adequately weight recent industry trends in cloud adoption. Recommendation: Increase weighting for technology transformation signals by 10 percentage points.</p>
  </div>

  <div class="insight info">
    <h3 style="margin-top: 0; color: #f59e0b;">⚠ False Positives</h3>
    <p><strong>Regulatory concerns:</strong> Predicted 2 regulatory questions that were not asked. Despite sector news, analysts did not focus on regulatory topics. Recommendation: Recalibrate sector sensitivity weights and add investor sentiment analysis.</p>
  </div>

  <h2>Question Comparison Analysis</h2>
  <table>
    <thead>
      <tr>
        <th>Category</th>
        <th>Predicted</th>
        <th>Actual</th>
        <th>Accuracy</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Revenue / Growth</td>
        <td>3</td>
        <td>3</td>
        <td style="color: #10b981; font-weight: 600;">100%</td>
      </tr>
      <tr>
        <td>Margin / Profitability</td>
        <td>2</td>
        <td>2</td>
        <td style="color: #10b981; font-weight: 600;">100%</td>
      </tr>
      <tr>
        <td>Technology</td>
        <td>0</td>
        <td>1</td>
        <td style="color: #E31837; font-weight: 600;">0%</td>
      </tr>
      <tr>
        <td>Guidance</td>
        <td>2</td>
        <td>2</td>
        <td style="color: #10b981; font-weight: 600;">100%</td>
      </tr>
      <tr>
        <td>International</td>
        <td>1</td>
        <td>1</td>
        <td style="color: #10b981; font-weight: 600;">100%</td>
      </tr>
      <tr>
        <td>Regulation</td>
        <td>2</td>
        <td>0</td>
        <td style="color: #E31837; font-weight: 600;">0%</td>
      </tr>
    </tbody>
  </table>

  <h2>Recommended Model Adjustments</h2>
  <ul>
    <li><strong>Increase technology transformation weight:</strong> 15% → 25%</li>
    <li><strong>Reduce regulatory sensitivity:</strong> 20% → 10%</li>
    <li><strong>Add cloud migration signal tracking:</strong> New data source integration</li>
    <li><strong>Enhance investor sentiment analysis:</strong> Incorporate social media and analyst report sentiment</li>
  </ul>

  <h2>Next Steps</h2>
  <ol>
    <li>Approve model adjustments for next training cycle</li>
    <li>Integrate additional data sources (tech trend indicators, investor sentiment)</li>
    <li>Schedule model retraining for ${new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString()}</li>
    <li>Validate improvements with Q2 FY26 predictions</li>
  </ol>

  <div class="footer">
    <p><strong>CONFIDENTIAL</strong> - For Internal Use Only</p>
    <p>Earnings Intelligence Copilot | AI Model Learning Report</p>
    <p>Generated on ${new Date().toLocaleString()}</p>
  </div>
</body>
</html>
  `;
  
  return content;
};

export const generateTrainingData = (data: any[]) => {
  const headers = ['Question ID', 'Predicted Question', 'Was Asked', 'Actual Phrasing', 'Similarity %', 'Category', 'Feedback'];
  
  const rows = data.map(row => [
    row.id,
    `"${row.predictedQuestion}"`,
    row.wasAsked ? 'Yes' : 'No',
    `"${row.actualPhrasing}"`,
    row.similarity,
    row.category,
    row.feedback
  ]);
  
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.join(','))
  ].join('\n');
  
  return csvContent;
};
