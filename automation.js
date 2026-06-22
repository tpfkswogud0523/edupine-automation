/**
 * K에듀파인 기안문 자동화 모듈
 * Chrome CDP (원격 디버깅) 방식으로 기존 로그인 세션 재사용
 *
 * 사전 조건:
 *   바탕화면의 "에듀파인 자동화 Chrome" 바로가기로 Chrome을 실행하고
 *   에듀파인에 로그인한 뒤 기안문 작성 화면을 열어둘 것
 */

require('dotenv').config();
const { chromium } = require('playwright');

const CDP_URL = 'http://localhost:9222';
const EDUPINE_HOST = ['klef.sen.go.kr', 'eduptl.kr', 'keris_ui'];

let browser = null;
let page = null;

// ─────────────────────────────────────────
// CDP로 Chrome에 연결
// ─────────────────────────────────────────
async function connectToChrome() {
  try {
    browser = await chromium.connectOverCDP(CDP_URL);
    console.log('  ✅ Chrome CDP 연결 성공');
    return browser;
  } catch (e) {
    throw new Error(
      'Chrome에 연결할 수 없습니다.\n' +
      '  → 바탕화면의 "에듀파인 자동화 Chrome" 바로가기로 Chrome을 실행하세요.\n' +
      '  → 이미 열려있다면 기존 Chrome을 종료 후 바로가기로 다시 실행하세요.'
    );
  }
}

// ─────────────────────────────────────────
// 에듀파인 탭 찾기
// ─────────────────────────────────────────
async function findEdupinePage() {
  if (!browser) await connectToChrome();

  const contexts = browser.contexts();
  for (const ctx of contexts) {
    for (const p of ctx.pages()) {
      const url = p.url();
      if (EDUPINE_HOST.some(h => url.includes(h))) {
        page = p;
        console.log(`  ✅ 에듀파인 탭 발견: ${url.substring(0, 80)}`);
        return page;
      }
    }
  }

  // 탭이 없으면 새 탭에서 에듀파인 열기
  console.log('  ⚠️  에듀파인 탭이 없습니다. 새 탭을 열겠습니다...');
  const defaultCtx = browser.contexts()[0];
  page = await defaultCtx.newPage();
  await page.goto('https://sen.eduptl.kr/bpm_lgn_lg00_001.do');
  throw new Error(
    '에듀파인 탭이 없어서 로그인 페이지를 열었습니다.\n' +
    '  → 공인인증서로 로그인 후 기안문 작성 화면을 여세요.\n' +
    '  → 완료 후 프로그램을 다시 실행하세요.'
  );
}

// ─────────────────────────────────────────
// 현재 페이지에서 기안문 작성 화면인지 확인
// ─────────────────────────────────────────
async function isDraftWriteScreen() {
  if (!page) return false;
  try {
    const frames = page.frames();
    for (const f of frames) {
      const url = f.url();
      if (url.includes('draft') || url.includes('write') || url.includes('ginan')) {
        return true;
      }
    }
    // 본문 에디터가 있는지 확인
    const hasEditor = await page.evaluate(() => {
      return !!document.querySelector('[id*="editor"], [id*="Editor"], iframe[id*="body"]');
    }).catch(() => false);
    return hasEditor;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────
// kedu 프레임 메뉴 링크 덤프 (디버그용)
// ─────────────────────────────────────────
async function dumpKeduLinks() {
  if (!page) return [];
  await page.waitForTimeout(2000); // 동적 렌더링 대기

  const keduFrame = page.frame({ name: 'kedu' });
  if (!keduFrame) {
    console.log('  ⚠️  kedu 프레임 없음');
    return [];
  }

  try {
    const links = await keduFrame.evaluate(() => {
      return Array.from(document.querySelectorAll('a, [onclick]'))
        .map(el => ({
          tag: el.tagName,
          text: el.textContent.trim().replace(/\s+/g, ' ').substring(0, 40),
          href: (el.getAttribute('href') || '').substring(0, 120),
          onclick: (el.getAttribute('onclick') || '').substring(0, 120)
        }))
        .filter(l => l.text.length > 0);
    });
    return links;
  } catch (e) {
    console.log(`  ⚠️  kedu 프레임 접근 실패: ${e.message.substring(0, 80)}`);
    return [];
  }
}

// ─────────────────────────────────────────
// 기안문 작성 화면으로 이동
// ─────────────────────────────────────────
async function navigateToDraftWrite() {
  if (!page) {
    await connectToChrome();
    await findEdupinePage();
  }

  console.log('\n  🧭 기안문 작성 화면으로 이동 중...');

  // 이미 기안문 작성 화면이면 그대로
  if (await isDraftWriteScreen()) {
    console.log('  ✅ 이미 기안문 작성 화면입니다.');
    return true;
  }

  // ── 방법 1: kedu 프레임 링크 탐색 ──────────────────
  console.log('  📋 kedu 프레임 메뉴 링크 탐색 중...');
  const keduLinks = await dumpKeduLinks();

  if (keduLinks.length > 0) {
    console.log(`  발견된 링크 ${keduLinks.length}개:`);
    keduLinks.slice(0, 30).forEach(l => {
      console.log(`    [${l.tag}] "${l.text}" href="${l.href}" onclick="${l.onclick.substring(0, 60)}"`);
    });

    const menuKeywords = ['기안문 작성', '기안문작성', '기안 작성', '기안작성', '문서 작성', '새기안', '기안문'];
    const keduFrame = page.frame({ name: 'kedu' });

    for (const kw of menuKeywords) {
      const match = keduLinks.find(l =>
        l.text === kw || l.text.includes(kw) ||
        l.href.includes(kw) || l.onclick.includes(kw)
      );
      if (match && keduFrame) {
        try {
          const clicked = await keduFrame.evaluate((keyword) => {
            const els = Array.from(document.querySelectorAll('a, [onclick]'));
            const found = els.find(el =>
              el.textContent.trim().includes(keyword) ||
              (el.getAttribute('href') || '').includes(keyword) ||
              (el.getAttribute('onclick') || '').includes(keyword)
            );
            if (found) { found.click(); return true; }
            return false;
          }, kw);

          if (clicked) {
            await page.waitForTimeout(2500);
            console.log(`  ✅ "${kw}" 클릭 성공`);
            return true;
          }
        } catch { /* 다음 시도 */ }
      }
    }
  } else {
    console.log('  ℹ️  kedu 프레임에 링크 없음 (동적 로딩 중이거나 접근 불가)');
  }

  // ── 방법 2: kedufine 프레임 직접 URL 주입 ──────────
  // K에듀파인 기안문 작성 URL 후보
  const draftUrls = [
    'https://sen.eduptl.kr/bpm_man_dr10_001.do',
    'https://sen.eduptl.kr/bpm_man_dr00_001.do',
    'https://sen.eduptl.kr/bpm_man_dr01_001.do',
    'https://sen.eduptl.kr/bpm_man_dr20_001.do',
    'https://sen.eduptl.kr/bpm_man_gn10_001.do',
    'https://sen.eduptl.kr/bpm_man_gn00_001.do',
  ];

  console.log('\n  🔗 kedufine 프레임 직접 URL 주입 시도...');
  for (const url of draftUrls) {
    try {
      // kedufine 프레임 src 변경 (메인 페이지 JS를 통해)
      const injected = await page.evaluate((targetUrl) => {
        const f = document.querySelector('iframe[name="kedufine"]') ||
                  document.querySelector('#kedufine');
        if (f) {
          f.src = targetUrl;
          return true;
        }
        return false;
      }, url);

      if (injected) {
        await page.waitForTimeout(2500);
        const kedufineFrame = page.frame({ name: 'kedufine' });
        if (kedufineFrame) {
          const frameUrl = kedufineFrame.url();
          if (frameUrl && !frameUrl.includes('about:blank') && !frameUrl.includes('login')) {
            console.log(`  ✅ kedufine 로드 성공: ${frameUrl}`);
            return true;
          }
        }
      }
    } catch { /* 다음 URL */ }
  }

  // ── 방법 3: 전체 페이지 직접 이동 ──────────────────
  console.log('\n  🌐 전체 페이지 직접 이동 시도...');
  for (const url of draftUrls) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 8000 });
      await page.waitForTimeout(1500);
      if (await isDraftWriteScreen()) {
        console.log(`  ✅ 직접 이동 성공: ${url}`);
        return true;
      }
    } catch { /* 다음 URL */ }
  }

  console.log('\n  ⚠️  기안문 작성 화면 자동 이동 실패.');
  console.log('  → Chrome에서 직접 "기안문 작성" 메뉴를 클릭해주세요.');
  console.log('  → 클릭 후 메뉴 1번(기안문 자동 작성)을 다시 실행하세요.');
  return false;
}

// ─────────────────────────────────────────
// 페이지 구조 전체 분석 (셀렉터 파악용)
// ─────────────────────────────────────────
async function analyzePageStructure() {
  if (!page) {
    await connectToChrome();
    await findEdupinePage();
  }

  console.log('\n  🔍 페이지 구조 분석 중...\n');
  console.log(`  현재 URL: ${page.url()}`);

  const frames = page.frames();
  console.log(`  전체 프레임 수: ${frames.length}`);

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    const frameUrl = frame.url();
    const frameName = frame.name();

    console.log(`\n  ──── [프레임 ${i}] name="${frameName}" url="${(frameUrl || 'about:blank').substring(0, 100)}" ────`);

    try {
      // 입력 필드
      const inputs = await frame.$$eval(
        'input:not([type="hidden"]), textarea, [contenteditable="true"]',
        els => els.slice(0, 30).map(el => ({
          tag: el.tagName,
          type: el.getAttribute('type') || '',
          id: el.id || '',
          name: el.getAttribute('name') || '',
          placeholder: el.placeholder || '',
          className: el.className ? el.className.substring(0, 40) : '',
          value: el.value ? el.value.substring(0, 30) : '',
          visible: el.offsetParent !== null
        }))
      ).catch(() => []);

      if (inputs.length > 0) {
        console.log('  [입력 필드]');
        inputs.forEach(inp => {
          const vis = inp.visible ? '' : ' (hidden)';
          console.log(`    <${inp.tag.toLowerCase()} id="${inp.id}" name="${inp.name}" placeholder="${inp.placeholder}"${vis}>`);
        });
      }

      // 버튼 + 모든 링크 (메뉴 항목 포함)
      const buttons = await frame.$$eval(
        'button, input[type="button"], input[type="submit"]',
        els => els.slice(0, 40).map(el => ({
          tag: el.tagName,
          text: (el.textContent || el.value || '').trim().replace(/\s+/g, ' ').substring(0, 40),
          id: el.id || '',
          className: el.className ? el.className.substring(0, 40) : '',
          onclick: (el.getAttribute('onclick') || '').substring(0, 80)
        })).filter(el => el.text.length > 0)
      ).catch(() => []);

      if (buttons.length > 0) {
        console.log('  [버튼]');
        buttons.forEach(btn => {
          console.log(`    <${btn.tag.toLowerCase()} id="${btn.id}" class="${btn.className}"> "${btn.text}"`);
        });
      }

      // ★ 메뉴 링크 (<a> 태그) - 기안문 작성 메뉴 찾기용
      const links = await frame.$$eval(
        'a',
        els => els.slice(0, 80).map(el => ({
          text: (el.textContent || '').trim().replace(/\s+/g, ' ').substring(0, 40),
          href: (el.getAttribute('href') || '').substring(0, 100),
          onclick: (el.getAttribute('onclick') || '').substring(0, 100),
          id: el.id || '',
          className: el.className ? el.className.substring(0, 40) : ''
        })).filter(el => el.text.length > 0)
      ).catch(() => []);

      if (links.length > 0) {
        console.log('  [링크/메뉴]');
        links.forEach(lnk => {
          const ref = lnk.href || lnk.onclick;
          console.log(`    "${lnk.text}" → ${ref.substring(0, 80) || '(no href/onclick)'}`);
        });
      }

      // iframe 목록
      const iframes = await frame.$$eval(
        'iframe',
        els => els.map(el => ({
          id: el.id || '',
          name: el.name || '',
          src: (el.getAttribute('src') || '').substring(0, 100)
        }))
      ).catch(() => []);

      if (iframes.length > 0) {
        console.log('  [내부 iframe]');
        iframes.forEach(f => {
          console.log(`    id="${f.id}" name="${f.name}" src="${f.src}"`);
        });
      }

      // body contenteditable → 본문 에디터
      const bodyEditable = await frame.evaluate(() => {
        const b = document.body;
        return b ? b.getAttribute('contenteditable') : null;
      }).catch(() => null);
      if (bodyEditable === 'true') {
        console.log('  ★★★ body[contenteditable="true"] 발견 → 본문 에디터!');
      }

    } catch (e) {
      console.log(`  (접근 불가: ${e.message.substring(0, 80)})`);
    }
  }

  // ★ kedu 프레임 전용: 좌측 메뉴 링크 집중 분석
  console.log('\n  ──────────────────────────────────────────────────');
  console.log('  ★ kedu 프레임 메뉴 링크 집중 분석 (2초 대기 후)');
  console.log('  ──────────────────────────────────────────────────');
  const keduLinks = await dumpKeduLinks();
  if (keduLinks.length > 0) {
    keduLinks.forEach((l, i) => {
      console.log(`  [${i + 1}] "${l.text}"`);
      if (l.href) console.log(`       href: ${l.href}`);
      if (l.onclick) console.log(`       onclick: ${l.onclick}`);
    });
  } else {
    console.log('  kedu 프레임에 링크/클릭 요소 없음');
    console.log('  → K에듀파인에 로그인 후 메뉴가 완전히 로드된 상태에서 다시 실행하세요.');
  }

  console.log('\n  ✅ 분석 완료');
}

// ─────────────────────────────────────────
// 결재정보 탭 입력
// ─────────────────────────────────────────
async function fillDraftInfo({ title, taskCard, docSummary }) {
  console.log('\n  📋 결재정보 입력 중...');
  const frames = page.frames();

  // 결재정보 탭 클릭 (탭이 여러 개인 경우)
  for (const frame of frames) {
    try {
      const tabClicked = await frame.evaluate(() => {
        const candidates = Array.from(document.querySelectorAll('a, li, td, span'));
        const tab = candidates.find(el => {
          const txt = (el.textContent || '').trim();
          return txt === '결재정보' || txt === '기안정보' || txt === '문서정보';
        });
        if (tab) { tab.click(); return true; }
        return false;
      });
      if (tabClicked) {
        await page.waitForTimeout(500);
        break;
      }
    } catch { /* 다음 프레임 시도 */ }
  }

  // 제목 입력
  if (title) {
    let titleFilled = false;
    const titleSelectors = [
      'input[id*="subject" i]', 'input[id*="title" i]', 'input[name*="subject" i]',
      'input[name*="title" i]', 'input[placeholder*="제목"]', '#docSubject',
      'input[id*="Subject"]', 'input[id*="Title"]'
    ];

    for (const frame of frames) {
      for (const sel of titleSelectors) {
        try {
          const el = await frame.waitForSelector(sel, { timeout: 1500 });
          if (el) {
            await el.click({ clickCount: 3 });
            await el.fill(title);
            console.log(`  ✅ 제목 입력: "${title}"`);
            titleFilled = true;
            break;
          }
        } catch { /* 계속 */ }
      }
      if (titleFilled) break;
    }

    if (!titleFilled) {
      // 모든 text input에서 제목처럼 보이는 것 찾기
      for (const frame of frames) {
        try {
          const filled = await frame.evaluate((t) => {
            const inputs = Array.from(document.querySelectorAll('input[type="text"], input:not([type])'));
            // 가장 큰 너비의 input이 제목일 가능성 높음
            const big = inputs.filter(inp => {
              const rect = inp.getBoundingClientRect();
              return rect.width > 300;
            });
            if (big.length > 0) {
              big[0].value = t;
              big[0].dispatchEvent(new Event('input', { bubbles: true }));
              big[0].dispatchEvent(new Event('change', { bubbles: true }));
              return true;
            }
            return false;
          }, title);
          if (filled) {
            console.log(`  ✅ 제목 입력 (자동감지): "${title}"`);
            titleFilled = true;
            break;
          }
        } catch { /* 계속 */ }
      }
    }

    if (!titleFilled) {
      console.log('  ⚠️  제목 필드를 찾지 못했습니다. 수동 입력이 필요합니다.');
    }
  }

  // 문서요지 입력
  if (docSummary) {
    const summarySelectors = [
      'input[id*="summary" i]', 'textarea[id*="summary" i]',
      'input[id*="docAbst" i]', 'input[id*="abstract" i]',
      'input[placeholder*="요지"]', 'textarea[placeholder*="요지"]'
    ];

    let summaryFilled = false;
    for (const frame of frames) {
      for (const sel of summarySelectors) {
        try {
          const el = await frame.waitForSelector(sel, { timeout: 1000 });
          if (el) {
            await el.fill(docSummary);
            console.log(`  ✅ 문서요지 입력`);
            summaryFilled = true;
            break;
          }
        } catch { /* 계속 */ }
      }
      if (summaryFilled) break;
    }
    if (!summaryFilled) {
      console.log('  ⚠️  문서요지 필드를 찾지 못했습니다.');
    }
  }

  await page.waitForTimeout(300);
}

// ─────────────────────────────────────────
// 본문 탭 클릭 후 본문 입력
// ─────────────────────────────────────────
async function fillBody(bodyText) {
  console.log('\n  📄 본문 입력 중...');
  const frames = page.frames();

  // 본문 탭 클릭
  for (const frame of frames) {
    try {
      const tabClicked = await frame.evaluate(() => {
        const candidates = Array.from(document.querySelectorAll('a, li, td, span'));
        const tab = candidates.find(el => {
          const txt = (el.textContent || '').trim();
          return txt === '본문' || txt === '문서본문' || txt === '내용';
        });
        if (tab) { tab.click(); return true; }
        return false;
      });
      if (tabClicked) {
        console.log('  ✅ 본문 탭 클릭');
        await page.waitForTimeout(1000);
        break;
      }
    } catch { /* 다음 프레임 */ }
  }

  // 본문 에디터 찾기
  let bodyFilled = false;

  // 방법 1: iframe 내 contenteditable body (GUEditor 등)
  for (const frame of frames) {
    const subFrames = frame.childFrames ? frame.childFrames() : [];
    const allFrames = [frame, ...subFrames];

    for (const f of allFrames) {
      try {
        const filled = await f.evaluate((text) => {
          // iframe 내부 편집 가능 영역
          const body = document.querySelector('body[contenteditable="true"]') ||
                       document.querySelector('[contenteditable="true"]') ||
                       document.querySelector('.editor-content') ||
                       document.querySelector('#editBody');
          if (body) {
            body.focus();
            // 기존 내용 지우고 새 내용 입력
            document.execCommand('selectAll');
            document.execCommand('insertText', false, text);
            return true;
          }
          return false;
        }, bodyText);

        if (filled) {
          console.log(`  ✅ 본문 입력 완료 (${bodyText.length}자)`);
          bodyFilled = true;
          break;
        }
      } catch { /* 다음 */ }
    }
    if (bodyFilled) break;
  }

  // 방법 2: textarea
  if (!bodyFilled) {
    for (const frame of frames) {
      try {
        const textareas = await frame.$$('textarea');
        for (const ta of textareas) {
          const visible = await ta.isVisible().catch(() => false);
          if (visible) {
            await ta.fill(bodyText);
            console.log(`  ✅ 본문 입력 완료 (textarea)`);
            bodyFilled = true;
            break;
          }
        }
      } catch { /* 다음 */ }
      if (bodyFilled) break;
    }
  }

  if (!bodyFilled) {
    console.log('  ⚠️  본문 에디터를 찾지 못했습니다.');
    console.log('  → 메뉴 5번 "화면 구조 분석"으로 에디터 구조를 확인하세요.');
  }

  return bodyFilled;
}

// ─────────────────────────────────────────
// 결재경로 설정
// ─────────────────────────────────────────
async function setApprovalLine(type = '일반기안문') {
  console.log(`\n  👥 결재경로 설정 (${type})...`);
  const frames = page.frames();

  /*
   * 일반기안문: 기안 → 교감(검토) → 교장(결재)
   * 재정기안문: 기안 → 교감(검토) → 행정실장(협조) → 교장(결재)
   *
   * 에듀파인 결재경로는 화면 구조를 먼저 분석한 뒤 수정이 필요합니다.
   * 지금은 결재경로 추가 버튼을 찾아 클릭하는 것까지 시도합니다.
   */

  // 결재경로 탭 클릭
  for (const frame of frames) {
    try {
      const clicked = await frame.evaluate(() => {
        const els = Array.from(document.querySelectorAll('a, li, td, span, button'));
        const tab = els.find(el => {
          const txt = (el.textContent || '').trim();
          return txt === '결재경로' || txt === '결재라인' || txt === '결재선';
        });
        if (tab) { tab.click(); return true; }
        return false;
      });
      if (clicked) {
        await page.waitForTimeout(500);
        break;
      }
    } catch { /* 다음 */ }
  }

  console.log('  ℹ️  결재경로는 화면 분석 후 자동화 예정');
  console.log('     지금은 수동으로 설정해주세요:');
  if (type === '일반기안문') {
    console.log('     기안 → 교감(검토) → 교장(결재)');
  } else {
    console.log('     기안 → 교감(검토) → 행정실장(협조) → 교장(결재)');
  }
}

// ─────────────────────────────────────────
// 기안문 전체 자동 입력 (메인 함수)
// ─────────────────────────────────────────
async function fillDocument({ title, bodyText, docSummary, taskCard, type = '일반기안문', attachmentPaths = [] }) {
  if (!page) {
    await connectToChrome();
    await findEdupinePage();
  }

  const results = {
    titleFilled: false,
    bodyFilled: false,
    approvalSet: false
  };

  try {
    // 결재정보 탭 입력
    await fillDraftInfo({ title, taskCard, docSummary });
    results.titleFilled = true;

    // 결재경로 설정
    await setApprovalLine(type);

    // 본문 탭 입력
    results.bodyFilled = await fillBody(bodyText);

    // 파일 첨부
    if (attachmentPaths.length > 0) {
      await attachFiles(attachmentPaths);
    }

  } catch (e) {
    console.log(`  ❌ 입력 오류: ${e.message}`);
  }

  return results;
}

// ─────────────────────────────────────────
// 파일 첨부
// ─────────────────────────────────────────
async function attachFiles(filePaths) {
  console.log(`\n  📎 파일 첨부 (${filePaths.length}개)...`);
  const frames = page.frames();
  const path = require('path');

  for (const fp of filePaths) {
    let attached = false;

    for (const frame of frames) {
      try {
        const fileInput = await frame.$('input[type="file"]').catch(() => null);
        if (fileInput) {
          await fileInput.setInputFiles(fp);
          await page.waitForTimeout(1000);
          console.log(`  ✅ 첨부: ${path.basename(fp)}`);
          attached = true;
          break;
        }

        // 파일첨부 버튼 클릭 → 파일 선택 대화상자
        const btnSelectors = [
          'button:has-text("파일첨부")', 'button:has-text("첨부파일")',
          'a:has-text("파일첨부")', '#btnFileAttach', '.btn-attach'
        ];
        for (const sel of btnSelectors) {
          try {
            const [fileChooser] = await Promise.all([
              page.waitForEvent('filechooser', { timeout: 2000 }),
              frame.click(sel)
            ]);
            await fileChooser.setFiles(fp);
            await page.waitForTimeout(1000);
            console.log(`  ✅ 첨부: ${path.basename(fp)}`);
            attached = true;
            break;
          } catch { /* 계속 */ }
        }
        if (attached) break;
      } catch { /* 다음 프레임 */ }
    }

    if (!attached) {
      console.log(`  ⚠️  첨부 실패: ${path.basename(fp)}`);
    }
  }
}

// ─────────────────────────────────────────
// 스크린샷 저장
// ─────────────────────────────────────────
async function saveScreenshot(filename = 'screenshot.png') {
  if (!page) return null;
  const fp = require('path').join(__dirname, 'screenshots', filename);
  require('fs').mkdirSync(require('path').dirname(fp), { recursive: true });
  await page.screenshot({ path: fp, fullPage: true });
  console.log(`  📸 스크린샷: ${fp}`);
  return fp;
}

// ─────────────────────────────────────────
// 연결 종료 (Chrome은 닫지 않음)
// ─────────────────────────────────────────
async function disconnect() {
  if (browser) {
    await browser.close().catch(() => {});
    browser = null;
    page = null;
    console.log('  🔌 CDP 연결 해제 (Chrome은 계속 실행 중)');
  }
}

function getPage() { return page; }
function getBrowser() { return browser; }

module.exports = {
  connectToChrome,
  findEdupinePage,
  isDraftWriteScreen,
  navigateToDraftWrite,
  dumpKeduLinks,
  analyzePageStructure,
  fillDocument,
  fillDraftInfo,
  fillBody,
  setApprovalLine,
  attachFiles,
  saveScreenshot,
  disconnect,
  getPage,
  getBrowser
};
