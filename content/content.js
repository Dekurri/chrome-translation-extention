'use strict';

const translatedNodes = new WeakMap();
let isProcessing = false;
let observer = null;
let currentFontSize = 12;

function isVisible(elem) {
  if (!elem) return false;
  const style = window.getComputedStyle(elem);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  if (style.opacity === '0') return false;
  const rect = elem.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function isTranslatableText(text) {
  if (!text || text.trim().length < 2) return false;
  if (/^[\s\d\p{P}\p{S}]+$/u.test(text)) return false;
  if (/^https?:\/\/\S+$/.test(text.trim())) return false;
  if (/^[\p{Emoji}\s]+$/u.test(text.trim())) return false;
  return true;
}

function getPageLanguage() {
  const lang = (document.documentElement.lang || '').toLowerCase();
  if (lang.startsWith('zh')) return '中文';
  if (lang.startsWith('en')) return 'English';
  if (lang.startsWith('ja')) return '日本語';
  if (lang.startsWith('ko')) return '한국어';
  if (lang.startsWith('fr')) return 'Français';
  if (lang.startsWith('de')) return 'Deutsch';
  if (lang.startsWith('es')) return 'Español';
  if (lang.startsWith('ru')) return 'Русский';
  return null;
}

function shouldSkipElement(elem) {
  if (!elem) return true;
  const tag = elem.tagName ? elem.tagName.toLowerCase() : '';
  if (['script', 'style', 'noscript', 'code', 'pre', 'textarea', 'input', 'select'].includes(tag)) return true;
  if (elem.closest && elem.closest('.tp-translation')) return true;
  if (elem.closest && elem.closest('[data-tp-extension]')) return true;
  if (elem.isContentEditable) return true;
  if (['svg', 'math'].includes(tag)) return true;
  return false;
}

function extractTextNodes(root) {
  root = root || document.body;
  const nodes = [];
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: function (node) {
        const parent = node.parentElement;
        if (shouldSkipElement(parent)) return NodeFilter.FILTER_REJECT;
        if (!isVisible(parent)) return NodeFilter.FILTER_REJECT;
        if (!isTranslatableText(node.textContent)) return NodeFilter.FILTER_REJECT;
        if (translatedNodes.has(node)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );
  let node;
  while ((node = walker.nextNode())) {
    nodes.push(node);
  }
  return nodes;
}

function insertTranslation(textNode, translatedText) {
  const parent = textNode.parentElement;
  if (!parent || !parent.isConnected) return;

  if (translatedNodes.has(textNode)) {
    const existing = translatedNodes.get(textNode);
    if (existing && existing.isConnected) {
      existing.textContent = translatedText;
      return;
    }
  }

  const span = document.createElement('span');
  span.className = 'tp-translation';
  span.setAttribute('data-tp-extension', 'true');
  span.style.fontSize = currentFontSize + 'px';
  span.textContent = translatedText;

  if (textNode.nextSibling) {
    parent.insertBefore(span, textNode.nextSibling);
  } else {
    parent.appendChild(span);
  }

  translatedNodes.set(textNode, span);
}

async function translateNodes(nodes) {
  const settings = await chrome.storage.local.get({
    targetLang: '中文',
    sourceLang: 'auto',
    enabled: true
  });

  if (!settings.enabled) return;
  if (nodes.length === 0) return;

  // 页面语言与目标语言相同则跳过
  if (settings.sourceLang !== 'auto' && settings.sourceLang === settings.targetLang) return;
  var pageLang = getPageLanguage();
  if (pageLang && pageLang === settings.targetLang) return;

  const texts = nodes.map(function (n) { return n.textContent.trim(); });

  const batchSize = 20;
  for (let i = 0; i < nodes.length; i += batchSize) {
    const batchNodes = nodes.slice(i, i + batchSize);
    const batchTexts = texts.slice(i, i + batchSize);

    await new Promise(function (resolve) {
      requestAnimationFrame(async function () {
        try {
          const response = await chrome.runtime.sendMessage({
            type: 'TRANSLATE',
            texts: batchTexts,
            targetLang: settings.targetLang,
            sourceLang: settings.sourceLang
          });

          if (response && response.translations) {
            response.translations.forEach(function (translated, j) {
              if (translated && batchNodes[j].isConnected) {
                insertTranslation(batchNodes[j], translated);
              }
            });
          }
        } catch (err) {
          console.warn('翻译失败:', err.message);
        }
        resolve();
      });
    });

    if (typeof scheduler !== 'undefined' && scheduler.yield) {
      await scheduler.yield();
    }
  }
}

async function translatePage() {
  if (isProcessing) return;
  isProcessing = true;

  try {
    const nodes = extractTextNodes();
    if (nodes.length === 0) return;
    await translateNodes(nodes);
  } finally {
    isProcessing = false;
  }
}

function clearTranslations() {
  var els = document.querySelectorAll('.tp-translation');
  for (var i = 0; i < els.length; i++) {
    els[i].remove();
  }
}

function setupObserver() {
  if (observer) observer.disconnect();

  observer = new MutationObserver(function (mutations) {
    var hasNewText = false;
    for (var mi = 0; mi < mutations.length; mi++) {
      var mutation = mutations[mi];
      if (mutation.type === 'childList') {
        for (var ni = 0; ni < mutation.addedNodes.length; ni++) {
          var node = mutation.addedNodes[ni];
          if (node.nodeType === Node.TEXT_NODE) {
            hasNewText = true;
            break;
          }
          if (node.nodeType === Node.ELEMENT_NODE && !shouldSkipElement(node)) {
            hasNewText = true;
            break;
          }
        }
      }
      if (hasNewText) break;
    }
    if (hasNewText) {
      clearTimeout(observer._debounceTimer);
      observer._debounceTimer = setTimeout(function () { translatePage(); }, 500);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

function setupSelectionTranslation() {
  document.addEventListener('mouseup', async function (e) {
    var selection = window.getSelection();
    var selectedText = selection ? selection.toString().trim() : '';
    if (!selectedText || selectedText.length < 2) return;

    var oldPopup = document.querySelector('.tp-selection-popup');
    if (oldPopup) oldPopup.remove();

    var range = selection.getRangeAt(0);
    var rect = range.getBoundingClientRect();

    var popup = document.createElement('div');
    popup.className = 'tp-selection-popup';
    popup.setAttribute('data-tp-extension', 'true');
    popup.style.cssText =
      'position:fixed;z-index:999999;' +
      'left:' + (rect.left + rect.width / 2) + 'px;' +
      'top:' + (rect.bottom + 8) + 'px;' +
      'transform:translateX(-50%);' +
      'background:#1f2937;color:#f9fafb;' +
      'padding:8px 14px;border-radius:8px;' +
      'font-size:14px;max-width:400px;' +
      'box-shadow:0 4px 12px rgba(0,0,0,0.15);' +
      'line-height:1.5;';
    popup.textContent = '翻译中...';
    document.body.appendChild(popup);

    try {
      var settings = await chrome.storage.local.get({
        targetLang: '中文',
        sourceLang: 'auto',
        enabled: true
      });
      if (!settings.enabled) {
        popup.remove();
        return;
      }

      var response = await chrome.runtime.sendMessage({
        type: 'TRANSLATE',
        texts: [selectedText],
        targetLang: settings.targetLang,
        sourceLang: settings.sourceLang
      });

      if (response && response.translations && response.translations[0]) {
        popup.textContent = response.translations[0];
      } else if (response && response.error) {
        popup.textContent = '翻译失败: ' + response.error;
      }
    } catch (err) {
      popup.textContent = '翻译失败: ' + err.message;
    }

    var closePopup = function (ev) {
      if (!popup.contains(ev.target)) {
        popup.remove();
        document.removeEventListener('click', closePopup);
      }
    };
    setTimeout(function () { document.addEventListener('click', closePopup); }, 0);
  });
}

async function init() {
  var data = await chrome.storage.local.get(['enabled', 'fontSize']);
  if (data.fontSize) currentFontSize = data.fontSize;
  if (data.enabled) {
    await translatePage();
  }
  setupObserver();
  setupSelectionTranslation();
}

chrome.storage.onChanged.addListener(function (changes) {
  if (changes.enabled) {
    if (changes.enabled.newValue) {
      translatePage();
    } else {
      clearTranslations();
    }
  }
  if (changes.targetLang || changes.sourceLang || changes._retranslate) {
    clearTranslations();
    translatePage();
  }
  if (changes.fontSize) {
    currentFontSize = changes.fontSize.newValue;
    var els = document.querySelectorAll('.tp-translation');
    for (var i = 0; i < els.length; i++) {
      els[i].style.fontSize = currentFontSize + 'px';
    }
  }
});

init();
