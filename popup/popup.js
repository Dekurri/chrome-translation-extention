'use strict';

const defaults = {
  enabled: true,
  sourceLang: 'auto',
  targetLang: '中文',
  fontSize: 12,
  apiKey: '',
  apiEndpoint: 'https://api.deepseek.com/v1/chat/completions',
  model: 'deepseek-chat'
};

async function loadSettings() {
  const data = await chrome.storage.local.get(defaults);
  document.getElementById('toggleEnabled').checked = data.enabled;
  document.getElementById('sourceLang').value = data.sourceLang;
  document.getElementById('targetLang').value = data.targetLang;
  document.getElementById('fontSize').value = data.fontSize;
  document.getElementById('fontSizeVal').textContent = data.fontSize + 'px';
  document.getElementById('apiKey').value = data.apiKey;
  document.getElementById('apiEndpoint').value = data.apiEndpoint;
  document.getElementById('model').value = data.model;
}

async function saveSetting(key, value) {
  await chrome.storage.local.set({ [key]: value });
}

function bindEvents() {
  document.getElementById('toggleEnabled').addEventListener('change', async (e) => {
    await saveSetting('enabled', e.target.checked);
  });

  document.getElementById('sourceLang').addEventListener('change', async (e) => {
    await saveSetting('sourceLang', e.target.value);
  });

  document.getElementById('targetLang').addEventListener('change', async (e) => {
    await saveSetting('targetLang', e.target.value);
  });

  document.getElementById('apiKey').addEventListener('change', async (e) => {
    await saveSetting('apiKey', e.target.value);
  });

  document.getElementById('apiEndpoint').addEventListener('change', async (e) => {
    await saveSetting('apiEndpoint', e.target.value);
  });

  document.getElementById('model').addEventListener('change', async (e) => {
    await saveSetting('model', e.target.value);
  });

  document.getElementById('fontSize').addEventListener('input', (e) => {
    document.getElementById('fontSizeVal').textContent = e.target.value + 'px';
  });
  document.getElementById('fontSize').addEventListener('change', async (e) => {
    await saveSetting('fontSize', Number(e.target.value));
  });

  // 语言设置变更时触发重新翻译
  ['sourceLang', 'targetLang'].forEach(id => {
    document.getElementById(id).addEventListener('change', async () => {
      const { enabled } = await chrome.storage.local.get('enabled');
      if (enabled) {
        await chrome.storage.local.set({ _retranslate: Date.now() });
      }
    });
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  bindEvents();
  document.getElementById('version').textContent = 'v' + chrome.runtime.getManifest().version;
});
