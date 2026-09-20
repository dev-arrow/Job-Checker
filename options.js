const DEFAULT_ONLINE_BLOCK_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSXQwB1I6sX7gLlXuvY6e6LxISk0E3LlRsMs3QPvQRfeqwnUsnBaFj9fE9SgXsHOxdviNl8vY0UztWv/pub?output=csv';
const DEFAULT_ONLINE_WHITELIST_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQcBkOImCEQ3Kv4_E5Ne-25mau5rMPbyy7GV8pljqIMOwXMsqZQbM87SqkSHJadqAxVEC6MT2vragzI/pub?output=csv';

const DEFAULT_RULES = [
  { id: 'english_only', name: 'English Language', enabled: true, isSystemRule: true },
  { id: 'remote_only', name: 'Remote Only', enabled: true, keywords: ['remote', 'work from home', 'wfh', 'telecommute'], negativeKeywords: ['onsite', 'on-site', 'hybrid', 'in-office', 'in office', 'must be local'], whitelist: ['onsite teams', 'hybrid on-prem/cloud environments', 'hybrid model', 'onsite employees', 'hybrid retrieval', 'microsoft teams', 'teams onsite', 'secrets manager', 'hybrid ai/ml architecture'], safePhrases: [] },
  { id: 'no_travel', name: 'No Travel Required', enabled: true, keywords: [], negativeKeywords: ['travel required', 'up to 25% travel', 'up to 50% travel', 'willing to travel', 'occasional travel', 'frequent travel'], safePhrases: ['no travel', '0% travel', 'no travel required', 'zero travel', 'travel assistance', 'group term life and travel assistance', 'travel products'] },
  { id: 'no_clearance', name: 'No Clearance Required', enabled: true, keywords: [], negativeKeywords: ['clearance required', 'must obtain clearance', 'public trust', 'public-trust', 'secret clearance', 'top secret', 'ts/sci', 'ts-sci', 'security clearance', 'agency clearance'], safePhrases: ['no clearance', 'clearance not required', 'secrets management', 'secret management', 'managing secrets', 'secrets manager'] },
  { id: 'no_fingerprint', name: 'No Fingerprint', enabled: true, keywords: [], negativeKeywords: ['fingerprint required', 'fingerprinting required', 'biometric'], safePhrases: ['no fingerprint', 'fingerprint not required'] }
];

document.addEventListener('DOMContentLoaded', async () => {
  const data = await chrome.storage.sync.get(['blockCompanies', 'rules', 'deployedDate', 'onlineBlockListUrl', 'onlineWhitelistUrl']);
  const companies = data.blockCompanies || [];
  const rules = data.rules || DEFAULT_RULES;
  
  // Pre-fill with your specific URLs if not already set
  document.getElementById('onlineBlockListUrl').value = data.onlineBlockListUrl || DEFAULT_ONLINE_BLOCK_URL;
  document.getElementById('onlineWhitelistUrl').value = data.onlineWhitelistUrl || DEFAULT_ONLINE_WHITELIST_URL;
  
  let deployedDate = data.deployedDate;
  if (!deployedDate) {
    deployedDate = new Date().toLocaleDateString();
    await chrome.storage.sync.set({ deployedDate });
  }
  document.getElementById('optionsDate').innerText = deployedDate;
  const manifest = chrome.runtime.getManifest();
  document.getElementById('optionsVersion').innerText = `v${manifest.version}`;

  renderCompanies(companies);
  renderRules(rules);

  // Sync button - loads from Google Sheets and saves to LOCAL storage
  document.getElementById('syncBtn').addEventListener('click', async () => {
    const blockUrl = document.getElementById('onlineBlockListUrl').value.trim();
    const whitelistUrl = document.getElementById('onlineWhitelistUrl').value.trim();
    const statusEl = document.getElementById('onlineDataStatus');
    
    statusEl.innerText = 'Syncing from Google Sheets...';
    statusEl.style.color = '#6b7280';
    
    // Save URLs to sync storage
    await chrome.storage.sync.set({ 
      onlineBlockListUrl: blockUrl,
      onlineWhitelistUrl: whitelistUrl
    });
    
    try {
      const blockData = await fetchOnlineList(blockUrl);
      const whitelistData = await fetchOnlineList(whitelistUrl);
      
      // Save to LOCAL storage (not sync) for fast access during scans
      await chrome.storage.local.set({
        cachedBlockCompanies: blockData,
        cachedWhitelistPhrases: whitelistData
      });
      
      statusEl.innerText = `✓ Synced! Loaded ${blockData.length} block companies and ${whitelistData.length} whitelist phrases to local cache.`;
      statusEl.style.color = '#059669';
      
      setTimeout(() => {
        statusEl.innerText = '';
      }, 5000);
    } catch (error) {
      console.error('Sync error:', error);
      statusEl.innerText = ' Error syncing. Check sheet permissions and URL.';
      statusEl.style.color = '#dc2626';
    }
  });

  document.getElementById('bulkAddBtn').addEventListener('click', async () => {
    const textarea = document.getElementById('bulkCompanies');
    const text = textarea.value;
    if (!text.trim()) return;
    const newCompanies = text.split(',').map(c => c.trim()).filter(c => c.length > 0);
    const current = (await chrome.storage.sync.get('blockCompanies')).blockCompanies || [];
    let addedCount = 0;
    for (const company of newCompanies) {
      if (!current.includes(company)) { current.push(company); addedCount++; }
    }
    await chrome.storage.sync.set({ blockCompanies: current });
    renderCompanies(current);
    textarea.value = '';
    const btn = document.getElementById('bulkAddBtn');
    const originalText = btn.innerText;
    btn.innerText = `Added ${addedCount}!`;
    btn.style.backgroundColor = '#059669';
    setTimeout(() => { btn.innerText = originalText; btn.style.backgroundColor = ''; }, 1500);
  });

  document.getElementById('saveRulesBtn').addEventListener('click', async () => {
    const updatedRules = rules.map(rule => {
      const enabled = document.getElementById(`enable-${rule.id}`).checked;
      const safeKws = document.getElementById(`safe-${rule.id}`)?.value.split(',').map(s => s.trim()).filter(s => s) || [];
      const negKws = document.getElementById(`neg-${rule.id}`).value.split(',').map(s => s.trim()).filter(s => s);
      const whitelistKws = document.getElementById(`whitelist-${rule.id}`)?.value.split(',').map(s => s.trim()).filter(s => s) || [];
      return { ...rule, enabled, safePhrases: safeKws, negativeKeywords: negKws, whitelist: whitelistKws };
    });
    await chrome.storage.sync.set({ rules: updatedRules });
    const btn = document.getElementById('saveRulesBtn');
    const originalText = btn.innerText;
    btn.innerText = 'Saved!';
    btn.style.backgroundColor = '#059669';
    setTimeout(() => { btn.innerText = originalText; btn.style.backgroundColor = ''; }, 1500);
  });
});

// Robust CSV Parser for Google Sheets
async function fetchOnlineList(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch');
    const text = await response.text();
    const cleanText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = cleanText.split('\n');

    let startIndex = 0;
    if (lines[0] && /name|company|phrase|keyword|title|list|item/i.test(lines[0])) {
      startIndex = 1;
    }

    return lines.slice(startIndex)
      .map(line => {
        let item = line.split(',')[0];
        if (item) item = item.replace(/^"|"$/g, '').trim();
        return item;
      })
      .filter(item => item && item.length > 1);
  } catch (error) {
    console.error('Error fetching online list:', error);
    return [];
  }
}

function renderCompanies(companies) {
  const list = document.getElementById('companyList');
  list.innerHTML = '';
  if (companies.length === 0) {
    list.innerHTML = '<p class="text-gray" style="font-size: 0.875rem; font-style: italic;">No local blocked companies added.</p>';
    return;
  }
  companies.forEach((company, index) => {
    const li = document.createElement('li');
    li.className = 'list-item';
    li.innerHTML = `<span style="font-weight: 500;">${company}</span><button data-index="${index}" class="btn-danger-text">Remove</button>`;
    li.querySelector('.btn-danger-text').addEventListener('click', async (e) => {
      const idx = e.target.dataset.index;
      const current = (await chrome.storage.sync.get('blockCompanies')).blockCompanies || [];
      current.splice(idx, 1);
      await chrome.storage.sync.set({ blockCompanies: current });
      renderCompanies(current);
    });
    list.appendChild(li);
  });
}

function renderRules(rules) {
  const list = document.getElementById('rulesList');
  list.innerHTML = '';
  rules.forEach(rule => {
    const div = document.createElement('div');
    div.className = 'rule-item';
    if (rule.isSystemRule) {
      div.innerHTML = `<div class="rule-header"><label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;"><input type="checkbox" id="enable-${rule.id}" ${rule.enabled ? 'checked' : ''} class="checkbox"><span>${rule.name} <span style="font-size:0.75rem; color:var(--text-muted); font-weight:normal;">(Automated)</span></span></label></div>`;
      list.appendChild(div);
      return;
    }
    const whitelistHtml = rule.id === 'remote_only' ? `<div style="margin-top: 0.75rem;"><label class="form-label" style="color: #8b5cf6;">📋 Whitelist Phrases (Comma separated)</label><input type="text" id="whitelist-${rule.id}" value="${(rule.whitelist || []).join(', ')}" class="input" style="background: white; border-color: #ddd6fe;"><p class="helper-text">If JD contains these phrases, "onsite/hybrid" keywords will be IGNORED.</p></div>` : '';
    const safePhrasesHtml = rule.id !== 'remote_only' ? `<div style="margin-top: 0.75rem;"><label class="form-label" style="color: #059669;">✅ Safe Phrases (Comma separated)</label><input type="text" id="safe-${rule.id}" value="${(rule.safePhrases || []).join(', ')}" class="input" style="background: white; border-color: #a7f3d0;"><p class="helper-text">If JD contains these, rule will <strong>PASS</strong>.</p></div>` : '';
    div.innerHTML = `<div class="rule-header"><label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;"><input type="checkbox" id="enable-${rule.id}" ${rule.enabled ? 'checked' : ''} class="checkbox"><span>${rule.name}</span></label></div>${whitelistHtml}${safePhrasesHtml}<div style="margin-top: 0.75rem;"><label class="form-label" style="color: #dc2626;">❌ Forbidden Keywords (Comma separated)</label><input type="text" id="neg-${rule.id}" value="${(rule.negativeKeywords || []).join(', ')}" class="input" style="background: white; border-color: #fecaca;"><p class="helper-text">If JD contains these (and NO whitelist/safe phrase), rule will <strong>FAIL</strong>.</p></div>`;
    list.appendChild(div);
  });
}