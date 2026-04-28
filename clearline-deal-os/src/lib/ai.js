const GROQ_KEY = import.meta.env.VITE_GROQ_API_KEY;

export async function callAI(systemPrompt, userContent) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GROQ_KEY}`
    },
    body: JSON.stringify({
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent }
      ]
    })
  });
  if (!res.ok) {
    let errText = await res.text();
    try {
      const parsed = JSON.parse(errText);
      if (parsed.error && parsed.error.message) errText = parsed.error.message;
    } catch (e) {}
    throw new Error(`Groq Error ${res.status}: ${errText}`);
  }
  const data = await res.json();
  return data.choices[0].message.content;
}

export async function runECRMAnalysis(documentText, geography, geoConfig) {
  const flagList = geoConfig.ecrm_flags.join(', ');

  const systemPrompt = `You are an economic crime risk analyst reviewing a business document for a potential acquisition. Your role is to identify patterns that may indicate financial irregularities, earnings manipulation, or economic crime risk.

You are reviewing for the following risk categories specific to ${geography}: ${flagList}

DOCUMENT SCANNING INSTRUCTIONS — follow these precisely:

1. Scan the full document including ALL notes to the financial statements, not just the main narrative.

2. For related_party_transactions: Look for any section headed "Related party transactions" or "Related parties" in the notes. Report any transactions with directors, family members of directors, shadow directors, or connected persons — including loans, management fees, property arrangements, or services. Evidence found in notes should be reported even if not mentioned in the main narrative.

3. For historic_regulatory: Look for any mention of HMRC, tax settlement, regulatory investigation, FCA action, or fines described as exceptional or one-off items. These may appear in the notes to the accounts under "exceptional items", "contingent liabilities", or "post balance sheet events" rather than in the main text.

4. For beneficial_ownership: Look for any section showing individual or corporate shareholdings above 10% of issued share capital. This is typically disclosed in the directors report or a dedicated "substantial shareholders" section. Report names and percentage holdings found.

5. For revenue_spike_pre_sale: Compare revenue figures across periods if multiple years are shown. Flag any year-on-year revenue growth above 30% in the final year before the reporting date, particularly if not explained in the narrative.

6. For account_manipulation: Look for unusual movements in debtors, accrued income, or prepayments relative to revenue. Flag if debtors days implied by balance sheet figures significantly exceed industry norms.

LISTED ENTITY CONTEXT:
Before beginning your analysis, determine whether this document is a UK listed company annual report (i.e. produced for a PLC subject to FCA listing rules and full audit requirements) rather than a private deal IM.
If the document is from a listed entity, add the following flag at the start of your flags array:
{
  "flag_type": "listed_entity_context",
  "evidence": "Document appears to be a listed company annual report subject to FCA disclosure requirements and full statutory audit. Many standard private-deal ECRM categories (directors loans, beneficial ownership opacity, account manipulation) carry materially lower risk in this context due to mandatory disclosure obligations.",
  "severity": "LOW",
  "recommended_action": "Apply ECRM outputs with listed-entity context. Focus review on related party transactions, exceptional items, and any regulatory actions disclosed in the notes."
}

Analyse the document and identify all applicable red flags. For each flag found, provide: the flag type, the specific evidence from the document (quote the relevant text where possible), the severity (HIGH / MEDIUM / LOW), and what a buyer should do about it.

Only report flags where you have found actual evidence in the document. Do not invent flags not supported by document text.

Respond in this exact JSON structure — no markdown, no preamble, raw JSON only:
{
  "overall_ecrm_risk": "HIGH | MEDIUM | LOW | CLEAN",
  "flags": [
    {
      "flag_type": "",
      "evidence": "",
      "severity": "HIGH | MEDIUM | LOW",
      "recommended_action": ""
    }
  ],
  "summary": "2-3 sentence plain English summary of economic crime risk profile, noting if this is a listed entity"
}

Be conservative. Flag anything that warrants scrutiny even if not conclusive. This is a screening tool, not a verdict. The buyer will verify independently.`;

  return callAI(systemPrompt, documentText);
}

