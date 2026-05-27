'use strict';

const defaults = {
  enabled: true,
  sourceLang: 'auto',
  targetLang: '中文',
  fontSize: 12,
  apiKey: '',
  apiEndpoint: 'https://api.deepseek.com/chat/completions',
  model: 'deepseek-v4-flash'
};

const cache = new Map();

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get('enabled');
  if (existing.enabled === undefined) {
    await chrome.storage.local.set(defaults);
  }
});

function buildPrompt(texts, targetLang, sourceLang) {
  const sourceHint = sourceLang === 'auto' ? '' : `从${sourceLang}`;
  const lines = texts.map((t, i) => `${i + 1}. ${t}`).join('\n');
  return `将以下文本${sourceHint}翻译为${targetLang}。保持编号对应，只返回翻译结果，不要额外解释：\n\n${lines}`;
}

function parseTranslations(responseText, count) {
  const lines = responseText.trim().split('\n');
  const results = [];
  for (const line of lines) {
    const match = line.match(/^\d+[\.\、\)]\s*(.+)/);
    if (match) {
      results.push(match[1].trim());
    }
  }
  if (results.length > 0) return results.slice(0, count);
  return lines.slice(0, count).map(s => s.replace(/^\d+[\.\、\)]\s*/, '').trim());
}

async function translateTexts(texts, targetLang, sourceLang) {
  const settings = await chrome.storage.local.get(defaults);
  if (!settings.apiKey) {
    throw new Error('请先设置 API Key');
  }

  const prompt = buildPrompt(texts, targetLang, sourceLang);

  let url = settings.apiEndpoint;
  if (!url.includes('//')) url = 'https://api.deepseek.com/chat/completions';
  if (!/\/chat\/completions$/.test(url)) url = url.replace(/\/+$/, '') + '/chat/completions';

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${settings.apiKey}`
    },
    body: JSON.stringify({
      model: settings.model,
      messages: [
        {
          role: 'system',
          content: `你是一个专业的翻译助手。将用户提供的文本翻译为${targetLang}。严格保持编号对应格式，只返回带编号的翻译结果。`
        },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 4096
    })
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`API 请求失败 (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('API 返回格式错误：缺少 choices[0].message.content');
  }

  return parseTranslations(content, texts.length);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'TRANSLATE') {
    (async () => {
      try {
        const { enabled } = await chrome.storage.local.get('enabled');
        if (!enabled) {
          sendResponse({ error: '翻译功能已关闭' });
          return;
        }

        const uncachedTexts = [];
        const uncachedIndices = [];
        const results = new Array(message.texts.length);

        message.texts.forEach((text, i) => {
          const cacheKey = `${text}|${message.targetLang}`;
          const cached = cache.get(cacheKey);
          if (cached) {
            results[i] = cached;
          } else {
            uncachedTexts.push(text);
            uncachedIndices.push(i);
          }
        });

        if (uncachedTexts.length > 0) {
          const batchSize = 20;
          for (let i = 0; i < uncachedTexts.length; i += batchSize) {
            const batchTexts = uncachedTexts.slice(i, i + batchSize);
            const batchIndices = uncachedIndices.slice(i, i + batchSize);
            const translations = await translateTexts(
              batchTexts,
              message.targetLang,
              message.sourceLang
            );
            translations.forEach((t, j) => {
              const origIdx = batchIndices[j];
              results[origIdx] = t;
              const cacheKey = `${batchTexts[j]}|${message.targetLang}`;
              cache.set(cacheKey, t);
            });
          }
        }

        sendResponse({ translations: results });
      } catch (err) {
        sendResponse({ error: err.message });
      }
    })();
    return true;
  }

  if (message.type === 'GET_SETTINGS') {
    chrome.storage.local.get(defaults).then(sendResponse);
    return true;
  }
});
