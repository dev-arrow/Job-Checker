document.addEventListener('DOMContentLoaded', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  const scanBtn = document.getElementById('scanBtn');
  const statusCard = document.getElementById('statusCard');
  const statusBadge = document.getElementById('statusBadge');
  const statusMessage = document.getElementById('statusMessage');
  const resultsContainer = document.getElementById('resultsContainer');
  const clearBtn = document.getElementById('clearBtn');

  if (!scanBtn) {
    console.error('Scan button not found in popup.html');
    return;
  }

  // Show version and date
  const manifest = chrome.runtime.getManifest();
  document.getElementById('versionDisplay').innerText = `v${manifest.version}`;
  
  const storageData = await chrome.storage.sync.get('deployedDate');
  const date = storageData.deployedDate || new Date().toLocaleDateString();
  document.getElementById('dateDisplay').innerText = `Deployed: ${date}`;

  // --- REUSABLE SCAN FUNCTION ---
  async function performScan() {
    // Set UI to loading state
    scanBtn.disabled = true;
    scanBtn.innerHTML = 'Scanning...';
    
    statusCard.style.display = 'block';
    statusBadge.className = 'badge badge-gray';
    statusBadge.innerText = 'Scanning...';
    statusMessage.innerText = 'Analyzing Job Description...';
    resultsContainer.style.display = 'none';
    clearBtn.style.display = 'none';

    try {
      // Check if the URL is valid for content scripts
      if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url === 'about:blank') {
        throw new Error('Cannot scan system pages. Please open a job posting website.');
      }

      const response = await chrome.tabs.sendMessage(tab.id, { action: 'SCAN_JD' });
      
      if (!response || !response.results) {
        throw new Error('No response from scanner.');
      }

      const results = response.results;
      const failedItems = results.filter(r => r.status === 'failed');
      
      if (failedItems.length === 0) {
        statusMessage.innerText = 'All checks passed! 🎉';
        statusBadge.innerText = 'Passed';
        statusBadge.className = 'badge badge-green';
        statusCard.classList.add('status-passed');
        statusCard.classList.remove('status-failed');
      } else {
        statusMessage.innerText = `${failedItems.length} issue(s) found.`;
        statusBadge.innerText = 'Failed';
        statusBadge.className = 'badge badge-red';
        statusCard.classList.add('status-failed');
        statusCard.classList.remove('status-passed');
      }

      // Render Results
      resultsContainer.innerHTML = '';
      resultsContainer.style.display = 'flex';
      
      results.forEach(result => {
        const isFailed = result.status === 'failed';
        const item = document.createElement('div');
        item.className = `result-item ${isFailed ? 'failed' : ''}`;
        
        item.innerHTML = `
          <div class="item-header">
            ${isFailed 
              ? '<svg class="text-red" style="width:16px; height:16px;" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"></path></svg>'
              : '<svg class="text-green" style="width:16px; height:16px;" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path></svg>'
            }
            <span class="${isFailed ? 'text-red' : 'text-gray'}">${result.ruleName}</span>
            ${isFailed ? '<span style="margin-left:auto; font-size: 0.75rem; color: var(--danger); cursor: pointer;">Click to highlight</span>' : ''}
          </div>
          ${isFailed ? `<p class="item-reason">${result.reason}</p>` : ''}
        `;

        if (isFailed) {
          item.addEventListener('click', () => {
            chrome.tabs.sendMessage(tab.id, { action: 'HIGHLIGHT_RULE', rule: result });
            clearBtn.style.display = 'block';
          });
        }

        resultsContainer.appendChild(item);
      });

    } catch (error) {
      console.error('Scan error:', error);
      
      if (error.message.includes('Receiving end') || error.message.includes('Could not establish connection')) {
        statusMessage.innerHTML = 'Extension not active on this page.<br><strong>Please refresh the page (F5) and try again.</strong>';
      } else if (error.message.includes('system pages')) {
        statusMessage.innerText = 'Cannot scan system pages. Please open a job posting.';
      } else {
        statusMessage.innerText = 'Error scanning page. Try refreshing.';
      }
      
      statusBadge.innerText = 'Error';
      statusBadge.className = 'badge badge-red';
    } finally {
      // Re-enable button after scan finishes
      scanBtn.disabled = false;
      scanBtn.innerHTML = `<svg style="width: 16px; height: 16px; margin-right: 6px; vertical-align: middle;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>Scan Current Page`;
    }
  }

  // 1. Run scan automatically when popup opens
  performScan();

  // 2. Run scan when button is clicked
  scanBtn.addEventListener('click', performScan);

  // Clear highlights button
  clearBtn.addEventListener('click', () => {
    chrome.tabs.sendMessage(tab.id, { action: 'CLEAR_HIGHLIGHTS' });
    clearBtn.style.display = 'none';
  });

  // Settings button
  document.getElementById('settingsBtn').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
});