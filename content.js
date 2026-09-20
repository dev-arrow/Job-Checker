// Default Rules
const DEFAULT_RULES = [
  { id: 'english_only', name: 'English Language', enabled: true, isSystemRule: true },
  { 
    id: 'remote_only', name: 'Remote Only', enabled: true, 
    keywords: ['remote', 'work from home', 'wfh', 'telecommute'], 
    negativeKeywords: ['onsite', 'on-site', 'hybrid', 'in-office', 'in office', 'must be local'],
    safePhrases: [] 
  },
  { 
    id: 'no_travel', name: 'No Travel Required', enabled: true, 
    keywords: [], 
    negativeKeywords: ['travel required', 'up to 25% travel', 'up to 50% travel', 'willing to travel', 'occasional travel', 'frequent travel'], 
    safePhrases: ['no travel', '0% travel', 'no travel required', 'zero travel', 'travel assistance', 'group term life and travel assistance', 'travel products'] 
  },
  { 
    id: 'no_clearance', name: 'No Clearance Required', enabled: true, 
    keywords: [], 
    negativeKeywords: ['clearance required', 'must obtain clearance', 'public trust', 'public-trust', 'secret clearance', 'top secret', 'ts/sci', 'ts-sci', 'security clearance', 'agency clearance'], 
    safePhrases: ['no clearance', 'clearance not required', 'secrets management', 'secret management', 'managing secrets', 'secrets manager'] 
  },
  { 
    id: 'no_fingerprint', name: 'No Fingerprint', enabled: true, 
    keywords: [], 
    negativeKeywords: ['fingerprint required', 'fingerprinting required', 'biometric'], 
    safePhrases: ['no fingerprint', 'fingerprint not required'] 
  }
];

let currentResults = [];

// Listen for scan request from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'SCAN_JD') {
    scanJobDescription().then(results => {
      currentResults = results;
      sendResponse({ success: true, results });
    });
    return true;
  } 
  else if (request.action === 'HIGHLIGHT_RULE') {
    clearHighlights();
    highlightText(request.rule);
    sendResponse({ success: true });
  }
  else if (request.action === 'CLEAR_HIGHLIGHTS') {
    clearHighlights();
    sendResponse({ success: true });
  }
});

async function scanJobDescription() {
  const settings = await chrome.storage.sync.get(['rules', 'blockCompanies']);
  const localData = await chrome.storage.local.get(['cachedBlockCompanies', 'cachedWhitelistPhrases']);
  
  const savedRules = settings.rules || DEFAULT_RULES;
  const localBlockCompanies = settings.blockCompanies || [];
  const cachedBlockCompanies = localData.cachedBlockCompanies || [];
  const cachedWhitelistPhrases = localData.cachedWhitelistPhrases || [];
  
  // Combine local and cached online block lists
  const allBlockCompanies = [...new Set([...localBlockCompanies, ...cachedBlockCompanies])];

  const clone = document.body.cloneNode(true);
  clone.querySelectorAll('script, style, noscript, svg, nav, footer, header').forEach(el => el.remove());
  const pageText = clone.textContent.toLowerCase();
  
  const pageTitle = document.title.toLowerCase();
  const h1Element = document.querySelector('h1');
  const h1Text = h1Element ? h1Element.textContent.toLowerCase() : '';

  const results = [];

  // 1. Check Block Companies
  for (const company of allBlockCompanies) {
    const lowerCompany = company.toLowerCase();
    if (pageText.includes(lowerCompany) || pageTitle.includes(lowerCompany) || h1Text.includes(lowerCompany)) {
      const source = cachedBlockCompanies.includes(company) ? '(Online Sheet)' : '(Local)';
      results.push({
        ruleId: 'block_company',
        ruleName: `Blocked Company: ${company} ${source}`,
        status: 'failed',
        matchedText: company,
        reason: `Company "${company}" is in your block list ${source}.`
      });
      break;
    }
  }

  // 2. Check System Rules (Language only)
  const langRule = savedRules.find(r => r.id === 'english_only');
  if (langRule && langRule.enabled !== false) results.push(checkLanguage());

  // 3. Check Standard Checklist Rules
  for (const rule of savedRules) {
    if (rule.enabled === false || rule.isSystemRule) continue;

    let status = 'passed';
    let matchedText = '';
    let reason = 'No issues found.';

    if (rule.id === 'remote_only') {
       const hasRemote = rule.keywords.some(kw => pageText.includes(kw.toLowerCase()));
       
       // Combine local and cached whitelists
       const allWhitelist = [...(rule.whitelist || []), ...cachedWhitelistPhrases];
       
       // Check whitelist FIRST - if ANY whitelist phrase exists, pass the rule
       let hasWhitelistPhrase = false;
       let matchedWhitelist = '';
       if (allWhitelist.length > 0) {
         for (const wl of allWhitelist) {
           if (pageText.includes(wl.toLowerCase())) {
             hasWhitelistPhrase = true;
             matchedWhitelist = wl;
             break;
           }
         }
       }
       
       // Only check negative keywords if NO whitelist phrase found
       let hasOnsite = false;
       if (!hasWhitelistPhrase) {
         hasOnsite = rule.negativeKeywords.some(kw => pageText.includes(kw.toLowerCase()));
       }
       
       if (!hasRemote) {
           status = 'failed';
           reason = 'Does not explicitly state "Remote", "WFH", or "Telecommute".';
       } else if (hasOnsite) {
           status = 'failed';
           const triggered = rule.negativeKeywords.find(kw => pageText.includes(kw.toLowerCase()));
           matchedText = triggered;
           reason = `Mentions "${triggered}", which overrides Remote status.`;
       } else if (hasWhitelistPhrase) {
           status = 'passed';
           const source = cachedWhitelistPhrases.includes(matchedWhitelist) ? '(Online Sheet)' : '(Local)';
           reason = `Whitelisted phrase found: "${matchedWhitelist}" ${source}`;
       }
    } else {
       // For other rules (travel, clearance, fingerprint)
       // Combine safe phrases with whitelist
       const allSafePhrases = [...(rule.safePhrases || []), ...cachedWhitelistPhrases];
       
       let hasSafePhrase = false;
       let matchedSafePhrase = '';

       // Check safe phrases FIRST
       if (allSafePhrases.length > 0) {
         for (const safe of allSafePhrases) {
           if (pageText.includes(safe.toLowerCase())) {
             hasSafePhrase = true;
             matchedSafePhrase = safe;
             break;
           }
         }
       }

       if (hasSafePhrase) {
         status = 'passed';
         const source = cachedWhitelistPhrases.includes(matchedSafePhrase) ? '(Online Sheet)' : '(Local)';
         reason = `Whitelisted phrase found: "${matchedSafePhrase}" ${source}`;
       } else {
         // Only check negative keywords if NO safe/whitelist phrase found
         if (rule.negativeKeywords && rule.negativeKeywords.length > 0) {
           for (const negKw of rule.negativeKeywords) {
             if (pageText.includes(negKw.toLowerCase())) {
               status = 'failed';
               matchedText = negKw;
               reason = `Found requirement: "${negKw}"`;
               break;
             }
           }
         }
         if (status === 'passed') reason = `No ${rule.name.toLowerCase()} requirements mentioned.`;
       }
    }

    results.push({ ruleId: rule.id, ruleName: rule.name, status, matchedText, reason });
  }

  return results;
}

// --- SYSTEM RULE: LANGUAGE CHECK ---
function checkLanguage() {
  const htmlLang = document.documentElement.lang || '';
  if (htmlLang && !htmlLang.toLowerCase().startsWith('en')) {
    return { ruleId: 'english_only', ruleName: 'English Language', status: 'failed', matchedText: `lang="${htmlLang}"`, reason: `Page language is set to "${htmlLang}", not English.` };
  }
  const commonEnglishWords = [' the ', ' is ', ' at ', ' which ', ' on ', ' a ', ' an ', ' and ', ' or ', ' but ', ' in ', ' with ', ' to ', ' for ', ' of ', ' it ', ' this ', ' that '];
  let englishScore = 0;
  commonEnglishWords.forEach(word => { if (document.body.textContent.toLowerCase().includes(word)) englishScore++; });
  if (englishScore < 5) {
    return { ruleId: 'english_only', ruleName: 'English Language', status: 'failed', matchedText: 'Low English word frequency', reason: 'Content does not appear to be written in English.' };
  }
  return { ruleId: 'english_only', ruleName: 'English Language', status: 'passed', matchedText: '', reason: 'Content is in English.' };
}

// --- DOM Highlighting Logic ---
function highlightText(rule) {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
  let keywordsToFind = [];
  if (rule.matchedText) {
    keywordsToFind.push(rule.matchedText);
  } else if (rule.ruleId === 'block_company') {
    const match = rule.ruleName.match(/Blocked Company: (.*)/);
    if (match) keywordsToFind.push(match[1].replace(' (Online Sheet)', '').replace(' (Local)', '').trim());
  } else {
    chrome.storage.sync.get(['rules']).then(s => {
        const savedRules = s.rules || DEFAULT_RULES;
        const r = savedRules.find(x => x.id === rule.ruleId);
        if (r && r.negativeKeywords) {
            keywordsToFind = r.negativeKeywords;
            doHighlight(walker, keywordsToFind, rule.reason);
        }
    });
    return;
  }
  doHighlight(walker, keywordsToFind, rule.reason);
}

function doHighlight(walker, keywords, reason) {
  let node, firstHighlight = null;
  while (node = walker.nextNode()) {
    for (const keyword of keywords) {
      const regex = new RegExp(`(${keyword})`, 'gi');
      if (regex.test(node.nodeValue)) {
        const span = document.createElement('span');
        span.innerHTML = node.nodeValue.replace(regex, `<mark class="jd-check-highlight" data-reason="${reason}">$1</mark>`);
        node.parentNode.replaceChild(span, node);
        if (!firstHighlight) firstHighlight = span.querySelector('.jd-check-highlight');
        break;
      }
    }
  }
  if (firstHighlight) {
    firstHighlight.scrollIntoView({ behavior: 'smooth', block: 'center' });
    firstHighlight.addEventListener('mouseenter', (e) => showTooltip(e, reason));
    firstHighlight.addEventListener('mouseleave', hideTooltip);
  }
}

function showTooltip(e, text) {
  hideTooltip();
  const tooltip = document.createElement('div');
  tooltip.className = 'jd-check-tooltip';
  tooltip.id = 'jd-check-active-tooltip';
  tooltip.innerText = text;
  document.body.appendChild(tooltip);
  const rect = e.target.getBoundingClientRect();
  tooltip.style.left = `${rect.left + window.scrollX}px`;
  tooltip.style.top = `${rect.top + window.scrollY - 40}px`;
}

function hideTooltip() {
  const existing = document.getElementById('jd-check-active-tooltip');
  if (existing) existing.remove();
}

function clearHighlights() {
  document.querySelectorAll('.jd-check-highlight').forEach(el => {
    const parent = el.parentNode;
    parent.replaceChild(document.createTextNode(el.innerText), el);
    parent.normalize();
  });
  hideTooltip();
}